// Canonical billing definitions: ONE seat-based paid plan (USD), plus the free-tier limits. Single
// source of truth shared by @byos3/auth (Better Auth Stripe plugin `limits`), the Namespace DO +
// services (entitlement gates / the op guardrail), and the web pricing UI. Money is in cents, USD.
// See agents/docs/billing.md.

/** All prices are USD. */
export const CURRENCY = "usd";

/** The single paid plan's Better Auth name + Stripe product key. */
export const PLAN_NAME = "byos3";

/** Per-seat price in cents. Annual = 10 months (2 free): $3/mo, $30/yr. */
export const PRICE_CENTS = { monthly: 300, annual: 3000 } as const;

/** A plan's numeric limits. `-1` = unlimited (maps cleanly onto the Better Auth plan `limits`). */
export interface PlanLimits {
  /** mounted volumes */
  volumes: number;
  /** soft monthly operation budget - the Cloudflare-cost guardrail (commits) */
  opsPerMonth: number;
}

/** No active subscription. Permanent, metered on-ramp (not a trial). */
export const FREE_LIMITS: PlanLimits = {
  volumes: 1,
  opsPerMonth: 5_000,
};

/** Active subscription (per seat). */
export const PAID_LIMITS: PlanLimits = {
  volumes: -1,
  opsPerMonth: 500_000,
};

export function isUnlimited(limit: number): boolean {
  return limit === -1;
}

/** True when usage is within a limit (`-1` = unlimited always passes). */
export function withinLimit(used: number, limit: number): boolean {
  return isUnlimited(limit) || used < limit;
}
