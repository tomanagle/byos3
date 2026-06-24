# API (API-first design)

byos3 is **API-first**: the public, versioned HTTP API at **`/api/v1`** is the canonical surface, and
**anything the web UI can do can be done programmatically with an API key.** The web uses sessions
(the most secure option for browsers); programmatic clients use API keys. These are just two
*authentication* methods — **authorization is the same RBAC for both** (`rbac.md`).

## Principles

- **One core, two transports.** Every capability is a `@byos3/core` use-case. The web's TanStack
  **server functions** and the public **`/api/v1`** routes are both *thin wrappers* over those
  use-cases, so parity is **structural**, not maintained by hand. A test asserts no capability is
  web-only.
- **Versioned and stable.** `/api/v1` is treated as a product: a versioned path, Zod-validated I/O
  (from `@byos3/protocol`), a generated OpenAPI spec, and a deprecation policy.
- **Stateless and explicit.** API routes are **namespace-scoped by path**
  (`/api/v1/namespaces/{namespaceId}/…`) — there is no hidden "active organization" as in the
  session/web flow. The caller names the namespace; we authorize against it.
- **Bytes still go direct.** File operations over the API use the same two-phase commit; the API
  returns **presigned PUT/GET URLs** and the client transfers to the bucket directly — the
  "bytes never through the Worker" rule holds (`storage-byo-s3.md`).

## Two authentication methods, one authorization model

| | Web | Programmatic |
|---|---|---|
| Credential | Better Auth **session cookie** (httpOnly, secure, CSRF-protected) | **API key** in the `x-api-key` header |
| Better Auth plugin | session | `apiKey()` |
| Best for | browsers | scripts, CI, integrations, the future desktop daemon |

A **unified auth middleware** resolves either credential into a `Principal { userId, method,
keyScopes? }`. Better Auth's apiKey plugin can **derive a session from an API key**, so
`auth.api.getSession` works for both and all downstream code is identical. The `Principal` then flows
through the existing `requirePermission` (edge) and `authorize()` (DO) — see `rbac.md`. Sessions stay
the browser path because exposing a long-lived bearer token to a browser is strictly worse than an
httpOnly, CSRF-protected cookie.

## API key management (Better Auth `apiKey` plugin)

Register `apiKey()` (server) + `apiKeyClient()` (client) alongside the organization/admin/stripe
plugins (`auth.md`). Users create/list/rotate/revoke keys **in the web UI and via `/api/v1`**
(dogfooding the API). Properties (all backed by the plugin):

- **Shown once, hashed at rest**, identified by a non-secret **prefix** (safe to log for audit).
- **Expiry** (`expiresIn`), **per-key rate limits** (`rateLimitMax`/`rateLimitTimeWindow`),
  **usage quota** (`remaining` + `refill`), arbitrary **metadata**, and **`permissions`** (scopes).
- Ownership is the user; a key may be **restricted to specific namespaces** via metadata.

## Key scopes compose with RBAC (least privilege)

A key's **`permissions`** use the **same `resource: [actions]` vocabulary** as our access-control
statements (`@byos3/core/authz`: `file`, `volume`, `share`, `ai`, `member`, …). The **effective
permission for an API-key request = intersection( the user's RBAC permission in that namespace , the
key's scopes )**. Therefore:

- A key can **never exceed its owner's role** — it can only *narrow* it.
- A read-only CI key = `{ file: ["read"], ai: ["query"] }`; a backup key scoped to one namespace; etc.
- `authorize()` takes an optional **`keyScopes`**; when the request is key-authenticated, the action
  must pass the role/grant check **and** the key scope. (Sessions have no `keyScopes` → full role.)

## Parity: the full file lifecycle via the API

With an API key, against `/api/v1/namespaces/{ns}/…`: list the tree (cursor) · create folder ·
`commit-intent` (→ missing chunk hashes + presigned PUTs for the target volume) · upload chunks
direct to the bucket · `commit` · download (→ presigned GET) · rename / move / delete / restore ·
manage connectors & volumes · create/revoke shares · observe changes (cursor poll or an
authenticated WebSocket). These call the **identical `@byos3/core` use-cases** the web uses.

## OpenAPI & SDK

Generate an **OpenAPI 3 document from the `@byos3/protocol` Zod schemas** (single source of truth),
publish interactive docs, and generate a typed client SDK. This is what makes "API-first" real rather
than aspirational, and keeps the spec from drifting from the implementation.

## Security

- API keys are **bearer tokens**: TLS only, **hashed at rest, shown once**, **least-privilege
  scopes**, **expiry + rotation**, **per-key rate limits**, revocable. **Never logged** — log the
  prefix / key id only (`logging.md`).
- **Sessions** are the most secure browser option (httpOnly + secure + CSRF). Don't hand browsers a
  bearer token.
- Neither credential ever exposes the user's **bucket credentials**: the API returns presigned URLs;
  connector secrets stay server-side, sealed (`code-architecture.md`, `secrets.md`).
- Every authenticated request emits a wide event with `auth_method`, `api_key_id` (prefix),
  `namespace_id`, and `op` — never the key or the presigned URL.

## Phasing

`/api/v1` + the unified session/key→`Principal` middleware land in **Phase 1** (session auth only at
first). The **apiKey plugin (key issuance/management), the OpenAPI spec, and the typed SDK land in
Phase 2.** See `plans/`.

## Where the code lives

- `apps/web/src/api/v1/*` — versioned HTTP routes (Hono), thin over `@byos3/core`.
- The **unified auth middleware** (session OR API key → `Principal`) in `apps/web`.
- `@byos3/protocol` — Zod schemas → request/response validation **and** OpenAPI generation.
- Better Auth `apiKey` plugin in the auth config; the `apikey` table in D1 (`data-model.md`).
