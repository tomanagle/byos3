# Billing & subscriptions

Paid subscriptions gate usage. Implemented with the **Better Auth Stripe plugin**
(`@better-auth/stripe`, `stripe@^22`), in the same Worker/D1 as auth.

## The BYO pricing model (important)

Because **storage is the user's own bucket, we do not resell GB.** We charge for the **service**:
sync coordination, sharing/seats, version-history depth, number of volumes, devices, and AI.
Entitlements meter coordination & features, **never raw storage size**.

**One paid tier, billed per seat.** There is no personal-vs-team split: a solo account is a 1-seat
subscription, a team is N seats, and inviting a member adds a seat. This keeps both the product and
the billing code simple (`seats x price`, one entitlement set).

| | Free | Paid |
|---|---|---|
| Price | **$0, permanent** | **$6 / seat / month** or **$60 / seat / year** (2 months free annual) |
| Volumes (mounted drives) | 1 | unlimited (fair use) |
| Devices | 1 | unlimited |
| Live sync | yes | yes |
| Version history | 30 days | long / unlimited |
| Sharing + RBAC | - | full (per-volume roles) |
| Members | just you | seat-based |
| AI / RAG | - | quota |
| Operations | small monthly budget | fair-use rate limit |

The free tier is a **permanent, metered on-ramp, not a trial** (the earlier cheap solo plan folds
into it). These numbers live in the plan's `limits` object plus the namespace `entitlement`.

## Seat = billed org member; volume membership = unbilled access

The org (namespace) is the **billing + identity** boundary; the **seat is the org member**. Inviting
someone into the org consumes a seat (billed). Granting a member access to a specific volume
(`volume_member`: `full | read_write | read_only` - `rbac.md`) is an **access grant, never a billing
event**. We never bill per volume or per share. **v1:** volumes can only be granted to org members,
so "has access" == "is a paid seat" - trivial billing, no guest concept. **v2 (the data model
already supports it):** external single-volume *guests* who use their own free account, do not
consume your seats, capped per account to prevent abuse.

## Cost guardrail (the only real Cloudflare cost)

Our marginal cost is **control-plane operations** (commits, syncs, presigns, pokes) + D1 - not
storage or egress (the user's bucket pays those), and **not idle connections** (the `Namespace` DO
uses the WebSocket **Hibernation API**, so idle live-sync sockets are near-free). So we meter
**operations**, and a per-namespace operation rate limit runs on **every** tier:

- **Free:** a small monthly operation budget; soft-throttle past it.
- **Paid:** a generous fair-use rate limit, scaled by seats.

This is the guardrail that makes a flat **$60/yr safe**: no account can cost more than roughly its
plan's worth of Cloudflare requests. Enforced in the `Namespace` DO (the single writer = the natural
op chokepoint): a per-namespace counter returns **HTTP 429** past the budget/rate. Read-only server
fns use a KV/D1 counter or Cloudflare's Rate Limiting binding.

## Disabled without a key

Billing is **off unless `STRIPE_SECRET_KEY` is set** (`secrets.md`). `createAuth` builds the Stripe
plugin only when the key is present, so on a keyless deploy the `/api/auth/stripe/*` endpoints
simply don't exist. The web client mirrors this: a `billingEnabled` flag (a server fn reading the
env) hides the rail's Billing entry and shows a "billing not enabled" state on `/billing` instead of
the upgrade flow. Everyone runs on the free limits; core file sync is unaffected.

## Configuration

```ts
stripe({
  stripeClient,                         // new Stripe(env.STRIPE_SECRET_KEY)
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
  createCustomerOnSignUp: true,
  subscription: {
    enabled: true,
    // ONE seat-based plan. Solo = 1 seat; a team passes seats = member count at checkout.
    // Free is NOT a plan here - it's the absence of an active subscription + the free `limits`.
    plans: [
      {
        name: "byos3",
        priceId: env.STRIPE_PRICE_MONTHLY, // $6 / seat / month
        annualDiscountPriceId: env.STRIPE_PRICE_ANNUAL, // $60 / seat / year
        limits: { volumes: 9999, devices: 9999, historyDays: 3650, ai: 5000, seats: true },
      },
    ],
    authorizeReference: async ({ user, referenceId }) =>
      isNamespaceOwner(user.id, referenceId), // owner-only billing actions
  },
})
```

**Free limits** (no active subscription): `{ volumes: 1, devices: 1, historyDays: 30, ai: 0, ops: <budget> }`.
The edge/DO falls back to these when `subscription.list` returns no `active`/`trialing` sub.

## Reference IDs map onto namespaces

A namespace **is** a Better Auth organization (`rbac.md`), so the subscription `referenceId` is
always the **organization id** with `customerType: "organization"`. The single plan is seat-based
(`seats: true`); the seat quantity is the per-subscription `seats` passed at checkout - **1 for a
solo account, N for a team** (one member = one seat). There is no separate personal plan.

`authorizeReference` (owner-only) pairs with the `billing:manage` permission gate. The org id is
the single billing reference - see `rbac.md`, `namespaces-and-acl.md`, `data-model.md`.

## Flows

- **Upgrade / checkout:** `authClient.subscription.upgrade({ plan, referenceId, seats?,
  successUrl, cancelUrl })` → redirects to Stripe Checkout.
- **Manage:** `authClient.subscription.billingPortal({ referenceId, returnUrl })`.
- **Webhook:** Stripe posts to `/api/auth/stripe/webhook` (Better Auth handles it; needs
  `STRIPE_WEBHOOK_SECRET`). Handle `checkout.session.completed`,
  `customer.subscription.{created,updated,deleted}`. On these, **refresh the affected namespace
  DO's entitlement cache** (see below).

## Entitlement enforcement (two layers)

1. **At the edge** - server functions / `/api/v1` routes check the active plan's `limits` before
   privileged actions: connecting an Nth volume, inviting an Nth member, enabling AI.
2. **In the DO** - the `Namespace` DO caches the entitlement (`entitlement` row, `data-model.md`)
   and enforces per-namespace limits inline: connected-device count, seats, version-history
   retention, and the **operation budget / rate limit** (the cost guardrail above). Refreshed on
   webhook or TTL.

Read current state with `authClient.subscription.list({ query: { referenceId } })` → first
`active`/`trialing` sub → its `limits`; **no active sub → the free `limits`**.

## Gotchas

- One active subscription per `referenceId` - pass `subscriptionId` when switching monthly/annual.
- We don't use a free trial as the on-ramp (the free *tier* is permanent + metered). A short
  conversion trial can be added later via `freeTrial` on the plan; one trial per account then.
- All line items in a checkout must share a billing interval.
- A team with an active subscription can't be auto-deleted - guard in `beforeDelete`.

See `plans/billing-subscriptions.md` for the build steps.
