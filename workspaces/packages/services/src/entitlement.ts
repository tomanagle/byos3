import { FREE_LIMITS, PAID_LIMITS, type PlanLimits, withinLimit } from "@byos3/protocol";
import { AppError } from "@byos3/core";
import type { ServiceContext } from "./context";

/**
 * What a namespace is entitled to RIGHT NOW. An active (or trialing) subscription unlocks the paid
 * limits scaled to its purchased seats; otherwise the permanent free limits apply. This is the single
 * resolver every gate calls - the edge (volume/seat caps) and the Namespace DO (the op guardrail).
 * See agents/docs/billing.md.
 */
export interface Entitlement {
  limits: PlanLimits;
  /** Billed seats (1 on the free tier). */
  seats: number;
  /** Whether an active paid subscription backs this namespace. */
  paid: boolean;
}

export async function resolveEntitlement(
  ctx: ServiceContext,
  namespaceId: string,
): Promise<Entitlement> {
  const sub = await ctx.subscriptions.activeSubscription(namespaceId);
  if (!sub) return { limits: FREE_LIMITS, seats: 1, paid: false };
  return { limits: PAID_LIMITS, seats: Math.max(1, sub.seats), paid: true };
}

/**
 * Assert that adding one more of `kind` stays within the namespace's limit; throws `limit_exceeded`
 * (mapped to HTTP 402 at the edge) otherwise. `used` is the current count. `-1` limits never throw.
 */
export function assertWithinLimit(used: number, limit: number, kind: string): void {
  if (!withinLimit(used, limit)) {
    throw new AppError("limit_exceeded", `${kind} limit reached (${limit}) - upgrade to add more.`);
  }
}
