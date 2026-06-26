import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";
import * as stripe from "pulumi-stripe";

/**
 * byos3 infrastructure as code (Pulumi + Cloudflare + Stripe).
 *
 * Pulumi owns the *stateful* Cloudflare resources (D1 database, Turnstile widget) and the **live
 * Stripe** product/prices/webhook; the Worker artifact itself is built + shipped by Wrangler in the
 * deploy workflow, using the IDs this stack exports. See agents/docs/deployment.md, billing.md.
 *
 * State is stored in a Cloudflare R2 bucket (Pulumi's S3-compatible DIY backend) - no Pulumi Cloud.
 * The deploy workflow sets PULUMI_BACKEND_URL (s3://<bucket>?endpoint=<acct>.r2.cloudflarestorage.com),
 * the R2 S3 creds (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY), and PULUMI_CONFIG_PASSPHRASE.
 *
 * Requires (deploy workflow sets these):
 *   - CLOUDFLARE_API_TOKEN  - provider auth (also creates the R2 state bucket via Wrangler)
 *   - config `cloudflareAccountId` (or env CLOUDFLARE_ACCOUNT_ID)
 *   - config secret `stripeApiKey` (or env STRIPE_API_KEY) - the LIVE Stripe key, OPTIONAL: without
 *     it the Stripe resources are skipped (billing simply stays off - billing.md).
 */
const config = new pulumi.Config();
const accountId = config.get("cloudflareAccountId") ?? process.env.CLOUDFLARE_ACCOUNT_ID;
if (!accountId) {
  throw new Error(
    "Set the account id: `pulumi config set cloudflareAccountId <id>` or env CLOUDFLARE_ACCOUNT_ID",
  );
}
// ── Domains & DNS ────────────────────────────────────────────────────────────────────────────────
// The web app is served at the apex `byos3.com`; the public API at `api.byos3.com`. There is NO
// app.byos3.com. Both Workers attach to their hostname via Wrangler **`custom_domain` routes** (in
// each app's wrangler.jsonc), which provision the proxied DNS records + edge TLS automatically at
// deploy time. We deliberately DON'T manage those records here - doing so would conflict with the
// Workers-managed custom domains and cause drift. Pulumi owns the zone-scoped / stateful resources
// (D1, Turnstile); the Cloudflare zone for byos3.com is expected to already exist in the account.
// `appDomain` comes from Pulumi config OR the APP_DOMAIN env var (the deploy workflow sets the
// latter from a GitHub Actions variable, so a fork "just works" without editing this file).
const appDomain = config.get("appDomain") ?? process.env.APP_DOMAIN ?? "byos3.com";
const apiDomain = config.get("apiDomain") ?? `api.${appDomain}`;

// Control-plane database. Phase 0 uses it for the waitlist; later phases add accounts, members,
// connectors, volumes, subscriptions, etc. (see agents/docs/data-model.md).
const db = new cloudflare.D1Database("byos3", {
  accountId,
  name: "byos3",
});

// Turnstile widget that protects the public waitlist form (and future public forms).
// Inputs + outputs verified against @pulumi/cloudflare 6.17.0: the widget exposes explicit `sitekey`
// (public) and `secret` outputs - use those rather than the resource id.
const turnstile = new cloudflare.TurnstileWidget("byos3", {
  accountId,
  name: "byos3",
  domains: [appDomain, "localhost"],
  mode: "managed",
});

// ── Billing (Stripe) ─────────────────────────────────────────────────────────────────────────────
// The single seat-based plan's product + USD prices + the webhook endpoint, in LIVE Stripe. Mirrors
// what dev/stripe-setup.sh does for the sandbox. Skipped entirely when no Stripe key is set.
// Amounts in cents - MIRROR packages/protocol/src/billing.ts PRICE_CENTS ($3/mo, $30/yr).
const PRICE_MONTHLY_CENTS = 300;
const PRICE_ANNUAL_CENTS = 3000;

const stripeApiKey = config.getSecret("stripeApiKey") ?? process.env.STRIPE_API_KEY;

function provisionStripe() {
  if (!stripeApiKey) return undefined;
  const provider = new stripe.Provider("stripe", { apiKey: stripeApiKey });
  const opts = { provider };

  const product = new stripe.Product("byos3", { name: "byos3" }, opts);
  const monthly = new stripe.Price(
    "byos3-monthly",
    {
      product: product.id,
      currency: "usd",
      unitAmount: PRICE_MONTHLY_CENTS,
      recurring: { interval: "month", intervalCount: 1 },
    },
    opts,
  );
  const annual = new stripe.Price(
    "byos3-annual",
    {
      product: product.id,
      currency: "usd",
      unitAmount: PRICE_ANNUAL_CENTS,
      recurring: { interval: "year", intervalCount: 1 },
    },
    opts,
  );
  const webhook = new stripe.WebhookEndpoint(
    "byos3",
    {
      url: `https://${appDomain}/api/auth/stripe/webhook`,
      enabledEvents: [
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
      ],
    },
    opts,
  );

  return {
    productId: product.id,
    monthlyId: monthly.id,
    annualId: annual.id,
    secret: webhook.secret,
  };
}

const stripeRes = provisionStripe();

export const d1DatabaseId = db.id;
export const turnstileSiteKey = turnstile.sitekey;
export const turnstileSecretKey = pulumi.secret(turnstile.secret);
// Hostnames the Workers attach to (informational; the custom_domain routes live in wrangler.jsonc).
export const webDomain = appDomain;
export const apiHostname = apiDomain;
// Stripe outputs (undefined when no key). Wire the price IDs into STRIPE_PRICE_MONTHLY/ANNUAL and
// the webhook secret into STRIPE_WEBHOOK_SECRET in the deploy workflow. See billing.md, secrets.md.
export const stripeProductId = stripeRes?.productId;
export const stripePriceMonthlyId = stripeRes?.monthlyId;
export const stripePriceAnnualId = stripeRes?.annualId;
export const stripeWebhookSecret = stripeRes ? pulumi.secret(stripeRes.secret) : undefined;
