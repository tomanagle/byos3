import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";

export interface PublicConfig {
  /** Billing configured (a Stripe key is set) - gates the billing/upgrade UI. See billing.md. */
  billingEnabled: boolean;
  /** GitHub OAuth configured - gates the "Continue with GitHub" button. See auth.md. */
  githubOAuth: boolean;
  /** Public API docs site (the `docs.` subdomain of this deploy's apex). Linked in the footer. */
  docsUrl: string;
}

/**
 * Public, unauthenticated feature flags derived from server env, so the client can hide surfaces for
 * features that aren't configured on this deploy (billing, GitHub OAuth).
 */
export const getPublicConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicConfig> => {
    const e = env as {
      STRIPE_SECRET_KEY?: string;
      AUTH_GITHUB_CLIENT_ID?: string;
      AUTH_GITHUB_CLIENT_SECRET?: string;
      APP_DOMAIN?: string;
    };
    // Docs live at the `docs.` subdomain of the deploy apex (APP_DOMAIN, e.g. "byos3.com"). In local
    // dev APP_DOMAIN is unset, so we link the hosted prod docs.
    const apex = e.APP_DOMAIN ?? "byos3.com";
    return {
      billingEnabled: Boolean(e.STRIPE_SECRET_KEY),
      githubOAuth: Boolean(e.AUTH_GITHUB_CLIENT_ID && e.AUTH_GITHUB_CLIENT_SECRET),
      docsUrl: `https://docs.${apex}`,
    };
  },
);
