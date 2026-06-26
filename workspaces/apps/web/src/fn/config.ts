import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";

/**
 * Whether billing is configured on this deploy (a Stripe key is set). When false, `createAuth`
 * omitted the Stripe plugin, so the UI hides the billing/upgrade surfaces. See billing.md, secrets.md.
 */
export const getBillingEnabled = createServerFn({ method: "GET" }).handler(
  async (): Promise<boolean> => {
    return Boolean((env as { STRIPE_SECRET_KEY?: string }).STRIPE_SECRET_KEY);
  },
);
