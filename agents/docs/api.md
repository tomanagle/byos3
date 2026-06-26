# API (API-first design)

byos3 is **API-first**: the public, versioned HTTP API at **`api.byos3.com/v1`** is the canonical
surface, and **anything the web UI can do can be done programmatically with an API key.** The web
uses sessions (the most secure option for browsers); programmatic clients use API keys. These are
just two *authentication* methods - **authorization is the same RBAC for both** (`rbac.md`).

## Two Workers, one core

The API and the web are **two separate Cloudflare Workers** (`monorepo.md`):

- **`apps/api`** - a **Hono** Worker served at `api.byos3.com`, authenticated by **API key**.
- **`apps/web`** - a **TanStack Start** Worker (UI + server functions), authenticated by **session**.
  It also hosts the `Namespace` Durable Object; `apps/api` reaches the DO via a **service binding**.

Both are thin transports over the **same `@byos3/services` use-cases**. We chose two Workers (not one
Worker serving both) so each has an independent runtime, deploy cadence, and threat surface - the
API is a Hono app, the web is a TanStack Start app, and neither's framework leaks into the other.

## Principles

- **One core, two transports.** Every capability is a `@byos3/services` use-case
  (`code-architecture.md`). The web's TanStack **server functions / routes** and the **`apps/api`**
  Hono routes are both *thin wrappers* over those use-cases, so parity is **structural**, not
  maintained by hand. A test asserts no capability is web-only.
- **Versioned and stable.** `api.byos3.com/v1` is treated as a product: a versioned path,
  Zod-validated I/O (from `@byos3/protocol`), a generated OpenAPI spec, and a deprecation policy.
- **Stateless and explicit.** API routes are **namespace-scoped by path**
  (`/v1/namespaces/{namespaceId}/…`) - there is no hidden "active organization" as in the
  session/web flow. The caller names the namespace; we authorize against it.
- **Bytes still go direct.** File operations over the API use the same two-phase commit; the API
  returns **presigned PUT/GET URLs** and the client transfers to the bucket directly - the
  "bytes never through the Worker" rule holds (`storage-byo-s3.md`).

## Two authentication methods, one authorization model

| | Web | Programmatic |
|---|---|---|
| Credential | Better Auth **session cookie** (httpOnly, secure, CSRF-protected) | **API key** as `Authorization: Bearer <key>` |
| Better Auth plugin | session | `apiKey()` |
| Best for | browsers | scripts, CI, integrations, the future desktop daemon |

Each Worker's **composition root** resolves its credential into a `Principal { userId, platformRole?,
keyScopes?, keyNamespaceId?, keyVolumeScope? }` and builds a `ServiceContext` (`code-architecture.md`):

- **`apps/web`** (`ctx.ts`) calls `auth.api.getSession({ headers })` → session user → `Principal`
  (no `keyScopes`/`keyNamespaceId` → authorized by the user's role).
- **`apps/api`** (`auth` middleware) reads `Authorization: Bearer <key>` and validates it with Better
  Auth's `auth.api.verifyApiKey({ body: { key } })` (same D1 auth tables). Keys are **org-owned**, so
  the verified key's `referenceId` **is the namespace** → `Principal` with **`keyNamespaceId`** (the
  authorization scope), **`keyScopes`** (the key's `permissions`), **`keyVolumeScope`** (from the
  key's metadata), and `userId` set to that **namespace's owner** (used only to attribute resources a
  key creates, never to authorize).

Downstream both flow into `@byos3/services`, but the two principals authorize **differently**: a
session is checked against the user's **org/resource role** (`rbac.md`); an org-key is **namespace-
scoped** - it may act on its `keyNamespaceId` and every volume in it, with **no user-role lookup** -
and the action must additionally fall within `keyScopes` (and, for file ops, `keyVolumeScope`).
Sessions stay the browser path because exposing a long-lived bearer token to a browser is strictly
worse than an httpOnly, CSRF-protected cookie.

## API key management (Better Auth `apiKey` plugin)

Register `apiKey({ references: "organization", enableMetadata: true })` (server) + `apiKeyClient()`
(client) alongside the organization/admin/stripe plugins (`auth.md`). Keys are **owned by the
organization (namespace), not the user**: `references: "organization"` makes the key's `referenceId`
the org id, so any owner/admin of the org can list + revoke it and a key **outlives the member who
minted it**. The web manages them via server functions (`fn/api-keys.ts`: `list/create/update/
delete`, each scoped to the caller's `namespaceId`); the same is available via `/api/v1`. Properties:

- **Shown once, hashed at rest**, identified by a non-secret **prefix** (safe to log for audit).
- **Expiry** (`expiresIn`), **per-key rate limits** (`rateLimitMax`/`rateLimitTimeWindow`),
  **usage quota** (`remaining` + `refill`), and **`permissions`** (scopes).
- **Volume scope** (`metadata.volumes`: `"*"` or a list of volume ids) limits the key's FILE
  operations to specific volumes; `"*"`/absent = every volume in the org. Set at create time and
  only meaningful when the key has `file:*` scopes.

## Key scopes are namespace-scoped + least privilege

A key's **`permissions`** use the **same `resource: [actions]` vocabulary** as our access-control
statements (`@byos3/core/authz`: `file`, `volume`, `share`, `ai`, `member`, …). Because keys are org
credentials, an API-key request is authorized by its **namespace**, not a user role:

- The action's resource/volume must belong to the key's `keyNamespaceId` (a key from another org is
  denied), the action must be within the key's **`keyScopes`**, and a file op must target a volume in
  the key's **`keyVolumeScope`**. No per-user role lookup happens for key callers.
- A read-only CI key = `{ file: ["read"], volume: ["list"] }`; a backup key restricted to one volume
  via its volume scope; etc. A key only ever *narrows* what the org can do.
- `assertCan*` (`@byos3/services`) branches on `keyNamespaceId`: present → namespace check + scope
  intersection; absent (sessions) → the user's role/grant check.

## Parity: the full file lifecycle via the API

With an API key, against `api.byos3.com/v1/namespaces/{ns}/…`: list the tree (cursor) · create folder ·
`commit-intent` (→ missing chunk hashes + presigned PUTs for the target volume) · upload chunks
direct to the bucket · `commit` · download (→ presigned GET) · rename / move / delete / restore ·
manage connectors & volumes · create/revoke shares · observe changes (cursor poll or an
authenticated WebSocket). These call the **identical `@byos3/services` use-cases** the web uses.

## Implementation pattern (`apps/api`)

The API Worker is a **`@hono/zod-openapi` `OpenAPIHono` app** - the schemas that validate requests
ARE the schemas that generate the docs (one source, no drift). The shape mirrors a proven layout:

- **Modules** in `src/modules/<name>/` split into `<name>.router.ts` (routes), `<name>.schema.ts`
  (zod request/response schemas, `.openapi(name)` for named components), and `<name>.serializer.ts`
  (row → DTO). Each router is built with `createRouter()` (an `OpenAPIHono` whose `defaultHook`
  rethrows validation failures so the root handler renders them).
- **Middleware chain** (`src/middleware/`): `request-id` → `wide-event` → `db` (per-request D1
  **session**) → `auth` (Bearer → `verifyApiKey` → `ServiceContext`), with `app.onError(errorHandler())`.
- **Routes are thin**: `createRoute({ request: { params/query/body }, responses })` then
  `app.openapi(route, c => …)`. The handler reads `c.req.valid("json"|"param"|"query")`, calls a
  **`@byos3/services`** use-case via static import, and returns. **No business logic, no dynamic imports.**
- **Errors** are Stripe-shaped: a typed `ApiError` (+ `API_ERROR_CODES`); the error handler maps
  `@byos3/core` `AppError` and `ZodError` onto it, always with a `requestId`. Authorization stays in
  the service (`assertCan*` = namespace ∩ keyScopes ∩ keyVolumeScope for keys) - the edge does not
  duplicate scope checks.

## Web data access (server functions, not the API Worker)

The web UI does **not** call `api.byos3.com` for its own data - that would mean cross-origin cookies
+ CORS + an extra network hop on every SSR load, and would couple the UI to the public `/v1`
versioning contract. Instead it uses **TanStack `createServerFn`** over `@byos3/services`, same-origin
and (during SSR) in-process:

```ts
export const uploadIntent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])              // session → ServiceContext on context.ctx (lib/middleware.ts)
  .inputValidator(VolumeUploadInput)          // SHARED @byos3/protocol schema
  .handler(({ context, data }) => uploadIntentSvc(context.ctx, data)); // service authorizes (assertCan)
```

So both transports are thin over the one services layer, both validate the same protocol schemas,
and authorization lives in the service for both - the web never duplicates the public API, and the
public API is never on the UI's hot path.

## OpenAPI & docs

`app.doc("/openapi.json", c => …)` serves the spec generated from the route schemas; `/docs` renders
it inline with **Scalar**. The doc uses the **function form** so `servers` is the request origin -
`https://api.<domain>` in prod, `http://localhost:8788` in dev - so the documented API base URL is
always correct and same-origin "Try It" works against the Worker directly.

`GET /healthz` is a documented (`tags: ["System"]`), unauthenticated liveness route returning
`200 {"status":"ok"}` - it's an `app.openapi(...)` route, so it shows in the reference like any other.

The **public reference site lives at `docs.<APP_DOMAIN>`** (e.g. docs.byos3.com), built from that
same spec - one source, no drift:

- `scripts/build-docs.ts` (`bun run docs:build`) imports the Hono app, pulls `/openapi.json`, stamps
  the version from the root `package.json`, and writes a self-contained `dist-docs/index.html` (Scalar
  via CDN, spec inlined) + `dist-docs/openapi.json`. Because the docs site is a different origin from
  the API, it **overrides `servers`** to `https://api.<APP_DOMAIN>` (from the `APP_DOMAIN` deploy var)
  so the reference shows the real backend and "Try It" targets it; the local docs container overrides
  it again to the local API via `DOCS_BASE_SERVER_URL`.
- `bun run docs:deploy` builds, then deploys `wrangler.docs.jsonc` - a **static-assets-only Worker**
  (`byos3-docs`, no `main`) whose `custom_domain` route provisions DNS + TLS for `docs.<APP_DOMAIN>`,
  exactly like web/api. CI runs this on every deploy (`deployment.md`); locally the `docs` container
  serves it (`dev/README.md`).

An `openapi` test asserts the documented surface. A typed client SDK can be generated from the spec.
This is what makes "API-first" real, not aspirational.

## Security

- API keys are **bearer tokens**: TLS only, **hashed at rest, shown once**, **least-privilege
  scopes**, **expiry + rotation**, **per-key rate limits**, revocable. **Never logged** - log the
  prefix / key id only (`logging.md`).
- **Sessions** are the most secure browser option (httpOnly + secure + CSRF). Don't hand browsers a
  bearer token.
- Neither credential ever exposes the user's **bucket credentials**: the API returns presigned URLs;
  connector secrets stay server-side, sealed (`code-architecture.md`, `secrets.md`).
- Every authenticated request emits a wide event with `auth_method`, `api_key_id` (prefix),
  `namespace_id`, and `op` - never the key or the presigned URL.

## Phasing

`@byos3/services`, the shared `@byos3/auth` (incl. the `apiKey` plugin), the `apps/api` OpenAPIHono
Worker (connectors + volumes), Bearer auth, and the generated OpenAPI/Scalar docs are **built**. Next:
the typed client SDK, per-key rate limits + idempotency middleware, and the namespace-scoped
journal/tree endpoints (with the Namespace DO). See `plans/`.

## Where the code lives

- **`@byos3/services`** - every use-case (the single source of business logic for both transports).
- **`@byos3/auth`** - `createAuth(...)`: the one Better Auth config (incl. `apiKey`), shared by both
  Workers. **`@byos3/db`** - schema + repositories + `createSessionDb` (D1 read replicas).
- **`workspaces/apps/api/src/`** - the OpenAPIHono Worker: `app.ts` (assembly + `/openapi.json` +
  `/docs`), `middleware/*`, `modules/<name>/<name>.{router,schema,serializer}.ts`, `lib/errors.ts`.
  Thin over `@byos3/services`; static imports only.
- **`workspaces/apps/web/src/fn/*.ts`** - TanStack **server functions** (`createServerFn`), the
  web's session-authed data path. `src/lib/middleware.ts` holds the chain (`loggingMiddleware` →
  `authMiddleware` → `ServiceContext` on `context.ctx`). The only `routes/api/*` HTTP handlers are
  the Better Auth catch-all (`api/auth/$`). It is the **only** `routes/api/*` HTTP handler - even the
  public waitlist form is a server function (`fn/waitlist.ts`); programmatic HTTP is `apps/api`.
- `@byos3/protocol` - the canonical Zod input schemas (`ConnectBucketInput`, `UploadIntentInput`,
  `VolumeUploadInput`, …). **Both transports validate against the same objects**: web server fns via
  `.inputValidator(schema)`, api routes via `createRoute({ request })` + `.openapi(name)` (one
  schema both validates and documents).
- Better Auth `apiKey` plugin in the auth config; the `apikey` table in D1 (`data-model.md`).
