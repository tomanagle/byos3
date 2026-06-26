import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { createAuth } from "@byos3/auth";

// Server-only - imported dynamically inside handlers so `env` is read within a request and never
// reaches the client bundle. The Better Auth config itself lives in @byos3/auth (shared with
// apps/api); this is just the web Worker's composition of it. See agents/docs/auth.md, api.md.

// The public apex (e.g. "byos3.com"), injected per-deploy from the APP_DOMAIN var. Undefined in
// local dev, where we fall back to localhost origins. Drives the prod baseURL + CSRF trusted origins.
const appDomain = (env as { APP_DOMAIN?: string }).APP_DOMAIN;

const e = env as {
  BETTER_AUTH_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_MONTHLY?: string;
  STRIPE_PRICE_ANNUAL?: string;
};

export const auth = createAuth({
  db: drizzle(env.DB),
  secret: e.BETTER_AUTH_SECRET,
  baseURL: appDomain ? `https://${appDomain}` : undefined,
  // Billing runs on the web Worker (checkout + webhook). Absent locally without a key.
  stripe: {
    secretKey: e.STRIPE_SECRET_KEY,
    webhookSecret: e.STRIPE_WEBHOOK_SECRET,
    priceMonthly: e.STRIPE_PRICE_MONTHLY,
    priceAnnual: e.STRIPE_PRICE_ANNUAL,
  },
  trustedOrigins: [
    // Production: the app's own origin (+ www) so Better Auth's CSRF check accepts it.
    ...(appDomain ? [`https://${appDomain}`, `https://www.${appDomain}`] : []),
    // Local dev (vite / docker).
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:4322",
    "http://localhost:4323",
    "http://localhost:4324",
    "http://localhost:4325",
    "http://localhost:4500",
  ],
});
