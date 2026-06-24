# Billing & subscriptions

Paid subscriptions gate usage. Implemented with the **Better Auth Stripe plugin**
(`@better-auth/stripe`, `stripe@^22`), in the same Worker/D1 as auth.

## The BYO pricing model (important)

Because **storage is the user's own bucket, we do not resell GB.** We charge for the **service**:
sync coordination, connected devices, team seats, version-history depth, number of volumes, and AI
features. Entitlements meter coordination & features, **never raw storage size**.

| | Free | Pro | Team |
|---|---|---|---|
| Namespaces | 1 personal | 1 personal | shared workspaces |
| Volumes (mounted drives) | 1 | several | several |
| Devices | 2 | unlimited | unlimited |
| Version history | 7 days | long / unlimited | long / unlimited |
| Members | — | — | seat-based (Stripe `seats`) |
| AI / RAG | — | quota | quota |

These numbers live in each plan's `limits` object in the plugin config.

## Configuration

```ts
stripe({
  stripeClient,                         // new Stripe(env.STRIPE_SECRET_KEY)
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
  createCustomerOnSignUp: true,
  subscription: {
    enabled: true,
    plans: [
      { name: "pro",  priceId: "...", annualDiscountPriceId: "...",
        limits: { volumes: 5,  devices: 9999, historyDays: 3650, ai: 1000 },
        freeTrial: { days: 14 } },
      { name: "team", priceId: "...",
        limits: { volumes: 20, devices: 9999, historyDays: 3650, ai: 5000, seats: true } },
    ],
    authorizeReference: async ({ user, referenceId, action }) =>
      isNamespaceOwner(user.id, referenceId),   // owner-only billing actions
  },
})
```

## Reference IDs map onto namespaces

A namespace **is** a Better Auth organization (`rbac.md`), so the subscription `referenceId` is
always the **organization id** with `customerType: "organization"` (a personal namespace is a
personal org; a team adds `seats` = member count — in plan config `seats: true` marks a seat-based
plan, while the actual count is the per-subscription `seats` quantity passed at checkout).

`authorizeReference` (owner-only) pairs with the `billing:manage` permission gate. The org id is
the single billing reference — see `rbac.md`, `namespaces-and-acl.md`, `data-model.md`.

## Flows

- **Upgrade / checkout:** `authClient.subscription.upgrade({ plan, referenceId, seats?,
  successUrl, cancelUrl })` → redirects to Stripe Checkout.
- **Manage:** `authClient.subscription.billingPortal({ referenceId, returnUrl })`.
- **Webhook:** Stripe posts to `/api/auth/stripe/webhook` (Better Auth handles it; needs
  `STRIPE_WEBHOOK_SECRET`). Handle `checkout.session.completed`,
  `customer.subscription.{created,updated,deleted}`. On these, **refresh the affected namespace
  DO's entitlement cache** (see below).

## Entitlement enforcement (two layers)

1. **At the edge** — server functions / `/api/v1` routes check the active plan's `limits` before
   privileged actions: connecting an Nth volume, inviting an Nth member, enabling AI.
2. **In the DO** — the `Namespace` DO caches the entitlement (`entitlement` row, `data-model.md`)
   and enforces per-namespace limits inline: connected-device count, seats, version-history
   retention. Refreshed on webhook or TTL.

Read current state with `authClient.subscription.list({ query: { referenceId } })` → first
`active`/`trialing` sub → its `limits`.

## Gotchas

- One active subscription per `referenceId` — pass `subscriptionId` when switching plans.
- One free trial per account across all plans.
- All line items in a checkout must share a billing interval.
- A team with an active subscription can't be auto-deleted — guard in `beforeDelete`.

See `plans/billing-subscriptions.md` for the build steps.
