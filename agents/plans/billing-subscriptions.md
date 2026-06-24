# Phase 2.5 — Billing & subscriptions

**Goal:** require a paid plan for usage beyond the free tier; enforce entitlements. Can land any
time after auth + namespaces exist; **must precede public launch.**

Design refs: `billing.md`, `auth.md`, `namespaces-and-acl.md`, `data-model.md`.

## Scope (in)

- Better Auth **Stripe plugin** (`@better-auth/stripe`) registered in the auth config; client
  plugin in `apps/web`.
- Plans (`free` implicit, `pro`, `team`) with `limits` (volumes, devices, historyDays, ai, seats).
- Checkout (`subscription.upgrade`) + billing portal (`subscription.billingPortal`).
- Webhook route `/api/auth/stripe/webhook`; on subscription events, **refresh the namespace DO
  entitlement cache**.
- `authorizeReference` = namespace-owner check; the subscription `referenceId` is **always the
  organization id** (`customerType: "organization"`); team adds `seats` = member count.
- Enforcement: edge checks (connect Nth volume, invite Nth member, enable AI) + DO inline checks
  (device count, history retention, seats).
- Billing UI: current plan, usage vs limits, upgrade/manage.

## Tasks

1. Configure plans + Stripe secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).
2. Wire webhook → entitlement refresh into the DO.
3. Implement entitlement read helper + edge guards in server fns / `/api/v1`.
4. DO entitlement cache + inline limit enforcement (device connect, history GC window).
5. Billing routes/UI with the Stripe client plugin.

## Acceptance criteria

- A free user is blocked from mounting a 2nd volume / connecting a 3rd device, with a clear
  upgrade prompt; a Pro user is not.
- Upgrading via Checkout immediately lifts limits (DO entitlement refreshed from the webhook).
- Version history older than the plan's `historyDays` is eligible for GC (ties to Phase 3 GC).
- Only a namespace owner can open the billing portal (`authorizeReference`).
- Team plan bills by `seats` = member count.
