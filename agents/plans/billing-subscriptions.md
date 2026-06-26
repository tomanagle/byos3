# Phase 2.5 - Billing & subscriptions

**Goal:** require a paid plan for usage beyond the free tier; enforce entitlements. Can land any
time after auth + namespaces exist; **must precede public launch.**

Design refs: `billing.md`, `auth.md`, `namespaces-and-acl.md`, `data-model.md`.

## Scope (in)

- Better Auth **Stripe plugin** (`@better-auth/stripe`) registered in the auth config; client
  plugin in `apps/web`.
- **One** seat-based paid plan (free = absence of an active sub) with `limits` (volumes, opsPerMonth)
  + seats. No `devices`/`historyDays`/`ai` - those were dropped (billing.md): a device cap is not a
  real cost lever, AI doesn't exist, and gating version-history depth would cap the user's own bucket.
- Checkout (`subscription.upgrade`) + billing portal (`subscription.billingPortal`).
- Webhook route `/api/auth/stripe/webhook` (Better Auth handles it).
- `authorizeReference` = namespace-owner check; the subscription `referenceId` is **always the
  organization id** (`customerType: "organization"`); `seats` = purchased member count.
- Enforcement: edge (`resolveEntitlement` → `connectBucket` volume cap), seats (org plugin
  `membershipLimit`/`invitationLimit`), and the DO op budget (per-month commit counter).
- Billing UI: current plan, upgrade/manage; Team UI: seat-gated member invites.

## Tasks

1. Configure the plan + Stripe secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).
2. `resolveEntitlement` helper (active sub → `PAID_LIMITS` + seats, else `FREE_LIMITS`).
3. Edge guards: `connectBucket` volume cap; seats via the org plugin's dynamic limits.
4. DO op-budget guardrail: the Worker passes `opsPerMonth` into `commit`; the DO meters per month.
5. Billing routes/UI + Team (member-invite) UI with the Stripe + organization client plugins.

## Acceptance criteria

- A free user is blocked from mounting a 2nd volume (HTTP 402) with a clear upgrade prompt; a paid
  user is not.
- A free user can't invite teammates (seats = 1); a paid user can invite up to their seat count.
- A namespace past its monthly op budget is rejected at `commit` (402); upgrading lifts it on the
  next write (the budget rides in per commit, no cache).
- Only a namespace owner can open the billing portal (`authorizeReference`).
- Billing is fully disabled (no Stripe plugin/UI) when `STRIPE_SECRET_KEY` is unset.
