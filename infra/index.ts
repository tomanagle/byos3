import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";

/**
 * byos3 infrastructure as code (Pulumi + Cloudflare).
 *
 * Pulumi owns the *stateful* Cloudflare resources (D1 database, Turnstile widget); the Worker
 * artifact itself is built + shipped by Wrangler in the deploy workflow, using the IDs this stack
 * exports. See agents/docs/deployment.md.
 *
 * Requires (deploy workflow sets these):
 *   - CLOUDFLARE_API_TOKEN  — provider auth
 *   - config `cloudflareAccountId` (or env CLOUDFLARE_ACCOUNT_ID)
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
// deploy time. We deliberately DON'T manage those records here — doing so would conflict with the
// Workers-managed custom domains and cause drift. Pulumi owns the zone-scoped / stateful resources
// (D1, Turnstile); the Cloudflare zone for byos3.com is expected to already exist in the account.
const appDomain = config.get("appDomain") ?? "byos3.com";
const apiDomain = config.get("apiDomain") ?? `api.${appDomain}`;

// Control-plane database. Phase 0 uses it for the waitlist; later phases add accounts, members,
// connectors, volumes, subscriptions, etc. (see agents/docs/data-model.md).
const db = new cloudflare.D1Database("byos3", {
  accountId,
  name: "byos3",
});

// Turnstile widget that protects the public waitlist form (and future public forms).
// NOTE: confirm attribute names against the installed @pulumi/cloudflare version.
const turnstile = new cloudflare.TurnstileWidget("byos3", {
  accountId,
  name: "byos3",
  domains: [appDomain, "localhost"],
  mode: "managed",
});

export const d1DatabaseId = db.id;
export const turnstileSiteKey = turnstile.id;
export const turnstileSecretKey = pulumi.secret(turnstile.secret);
// Hostnames the Workers attach to (informational; the custom_domain routes live in wrangler.jsonc).
export const webDomain = appDomain;
export const apiHostname = apiDomain;
