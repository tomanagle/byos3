# Auth

Authentication is **Better Auth**, running in the same Worker as the app, backed by **D1**.

## Setup

- Better Auth mounted as a catch-all API route in `apps/web` (`/api/auth/*`), handled inside the
  TanStack Start Worker. Plugins registered here: **organization** (multi-tenant RBAC; namespace ≡
  organization), **admin** (platform roles + impersonation), **apiKey** (programmatic access — byos3
  is API-first), and **stripe** (subscriptions). RBAC: `rbac.md`; billing: `billing.md`; API: `api.md`.
- **Two authentication methods, one authorization model:** a **session** cookie (web) or an **API
  key** (programmatic, `x-api-key`) both resolve — via a unified middleware — to one `Principal` that
  flows through RBAC. The apiKey plugin can derive a session from a key, so downstream checks are
  identical. See `api.md`. (`/api/v1` + unified auth = Phase 1; API key issuance + OpenAPI = Phase 2.)
- D1 adapter (via Drizzle). Sessions cached in **KV** for fast edge reads.
- Secrets: `BETTER_AUTH_SECRET`, OAuth provider credentials, plus the Stripe secrets used by the
  billing plugin. Stored as Wrangler secrets (never committed).

## Tables (Better Auth-owned, in D1)

Better Auth owns `user`, `session`, `account`, `verification`, plus — via the **organization
plugin** — `organization`, `member`, `invitation`, and — via the **apiKey plugin** — `apikey`. The
Stripe plugin adds `stripeCustomerId` and the `subscription` table. **Namespace ≡ `organization`**
(extended via `additionalFields`); there is **no separate `namespace` or `team` table**. Our own
tables — `connector`, `volume`, `grant`, `shareLink`, `mount` — reference `organization.id` /
`user.id`. See `data-model.md` and `rbac.md`.

## Account lifecycle

- **On signup:** create the user, then create their default **personal organization** (`type:
  personal` — the personal namespace) and the org-plugin `member` row (`owner`).
  `createCustomerOnSignUp: true` provisions the Stripe customer (`referenceId` = that organization id).
- **Email verification:** optionally required before privileged actions (e.g. connecting a volume
  or upgrading) via `requireEmailVerification`.
- **Sessions:** standard Better Auth sessions; the session resolves `user.id`, from which we load
  namespace membership for authorization.

## Authorization

Auth (who you are) is Better Auth; **authorization (what you may do) is RBAC** — the organization
plugin's roles/permissions + resource grants, enforced at the edge and re-checked in the DO. See
**`rbac.md`**.

## Client

Better Auth React client in `apps/web` for sign-in/up flows; the Stripe client plugin
(`stripeClient({ subscription: true })`) for checkout/portal. UI uses `@byos3/ui` (shadcn).
