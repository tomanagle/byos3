import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";

export interface PublicConfig {
  /** Billing configured (a Stripe key is set) - gates the billing/upgrade UI. See billing.md. */
  billingEnabled: boolean;
  /** GitHub OAuth configured - gates the "Continue with GitHub" button. See auth.md. */
  githubOAuth: boolean;
}

/**
 * Public, unauthenticated feature flags derived from server env, so the client can hide surfaces for
 * features that aren't configured on this deploy (billing, GitHub OAuth).
 */
export const getPublicConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicConfig> => {
    const e = env as {
      STRIPE_SECRET_KEY?: string;
      GITHUB_CLIENT_ID?: string;
      GITHUB_CLIENT_SECRET?: string;
    };
    return {
      billingEnabled: Boolean(e.STRIPE_SECRET_KEY),
      githubOAuth: Boolean(e.GITHUB_CLIENT_ID && e.GITHUB_CLIENT_SECRET),
    };
  },
);
