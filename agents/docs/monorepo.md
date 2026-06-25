# Monorepo, tooling & builds

## Layout

Everything that is a Bun workspace member lives under **`workspaces/`** (`apps/*` + `packages/*`);
non-members (`infra/`, `scripts/`, `secrets/`, `agents/`) stay at the repo root.

```
workspaces/
  apps/
    web/        TanStack Start Worker — UI + server fns + session-gated /api/v1; hosts the Namespace DO
    api/        Hono Worker (api.byos3.com) — API-key (Bearer) auth; OpenAPI; reaches the DO via binding
    desktop/    (Phase 4) native sync daemon
  packages/
    ui/         shadcn/ui components + Tailwind preset
    core/       domain entities (Connector, Volume, Namespace), ports, authz policy — pure, isomorphic
    services/   use-cases (connectBucket, uploadIntent, downloadUrl, …): authz + orchestration; the
                single business-logic layer both Workers wrap (code-architecture.md, api.md)
    db/         Drizzle schema + Better Auth schema + D1 repositories + createDb/createSessionDb
                (D1 read-replica sessions). The only place table definitions live.
    auth/       createAuth(...) — the single Better Auth config (email/password + organization +
                admin + apiKey), shared by both Workers
    s3/         aws4fetch SigV4, presign, multipart, provider adapters (S3/R2/B2/…)
    protocol/   Zod schemas: journal ops, cursor, API contracts
    crypto/     envelope encryption for connector creds; E2E seam
    logging/    wide-event logger (one canonical JSON event per request/hop)
    ai/         (Later) Workers AI + Vectorize RAG pipeline
  tests/        @byos3/e2e — Playwright e2e suite (storage round-trips, app flows) + MinIO fixture
infra/          Pulumi IaC (Cloudflare D1 + Turnstile) — standalone, NOT a workspace member
agents/         docs/ + plans/  (this documentation)
```

Root `package.json` globs are `["workspaces/apps/*", "workspaces/packages/*", "workspaces/tests"]`.
Both `apps/web` and `apps/api` are **thin transports** over `@byos3/services`; all business logic
lives in the package, not in either Worker. See `api.md` ("Two Workers, one core").

## Database access (D1 read replicas)

Read from a **per-request D1 Session** so reads route to the nearest replica with monotonic-read
consistency. `@byos3/db` exposes `createSessionDb(env.DB)` (`drizzle(d1.withSession("first-unconstrained"))`)
and `createDb(env.DB)` (plain, for scripts/tests). Create the session **once per request** in the
composition root — the web `ctx.ts` and the api `db` middleware — never at module scope.

## Bun vs Wrangler — the split that trips people up

- **Bun** is the package manager, workspace runner, and test runner for **pure packages**. Use
  `bun install`, `bun run <script>`, `bun test` for `packages/*`.
- **The app runs on Cloudflare Workers (`workerd`), NOT the Bun runtime.** Inside `apps/web` you
  must **not** use `Bun.serve`, `bun:sqlite`, `Bun.sql`, or `Bun.redis`. Use Workers primitives:
  Durable Object SQLite, D1, R2, KV.
- Dev/deploy the Worker with **Wrangler + `@cloudflare/vite-plugin`**.

## Workspaces

Bun workspaces (`"workspaces": ["apps/*", "packages/*"]` in root `package.json`). Packages are
referenced by name (`@byos3/core`, `@byos3/protocol`, …). `core` and `protocol` carry no
runtime-specific imports so they bundle cleanly into both the Worker and the browser.

## TanStack Start on Workers — config

Per the Cloudflare framework guide:

- Scaffolded with `npm create cloudflare@latest -- <app> --framework=tanstack-start`.
- Vite plugin: `cloudflare({ viteEnvironment: { name: "ssr" } })`.
- `wrangler.jsonc`: `main: "src/server.ts"` (custom entry that **exports the `Namespace` DO** and
  the handler), `compatibility_flags: ["nodejs_compat"]`, current `compatibility_date`,
  `observability.enabled: true`.
- Bindings reached in server code via `import { env } from "cloudflare:workers"` —
  `env.DB` (D1), `env.NAMESPACE` (DO), `env.CACHE` (R2, optional), secrets.
- `npm run dev` (local workerd, DO works), `npm run deploy`, `npm run cf-typegen` (binding types).

## Bindings (wrangler.jsonc)

| Binding | Type | Use |
|---|---|---|
| `DB` | D1 | global tables |
| `NAMESPACE` | Durable Object | per-namespace journal/tree |
| `CACHE` | R2 (optional) | dedup/thumbnail staging |
| `INDEX_QUEUE` | Queue (later) | AI indexing jobs |
| `VECTORIZE` | Vectorize (later) | embeddings |
| `AI` | Workers AI (later) | embeddings/LLM |

## Secrets (Wrangler secrets / `.dev.vars` locally)

- `CREDENTIAL_ENCRYPTION_KEY` — root key for envelope-encrypting connector creds.
- `BETTER_AUTH_SECRET`, OAuth provider secrets.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

Never commit secrets. `.dev.vars` is gitignored; production uses `wrangler secret put`.

## Migrations & ORM

Drizzle for D1 schema + migrations (`packages/protocol` or `apps/web/db`). DO SQLite schema is
created/migrated inside the DO's constructor/`blockConcurrencyWhile`.

## Lint, format & git hooks (oxc)

- **oxlint** — `bun run lint`. **oxfmt** — `bun run format` / `format:check`. Both are Rust, fast,
  zero-config-ish (`.oxlintrc.json` / `.oxfmtrc.json`). **Not** ESLint/Prettier.
- **lefthook** installs git hooks via `prepare` (on `bun install`): pre-commit formats + lints
  staged files, pre-push lints. See `deployment.md`.

## Deployment

GitHub Actions: `ci.yml` (lint + format-check + build) and `deploy.yml` (Pulumi `up` → inject D1
id/Turnstile key → build → migrate → `wrangler deploy`). Pulumi (`infra/`) owns D1 + Turnstile;
Wrangler ships the Worker. Full detail + required secrets in `deployment.md`.

## Testing

Two tiers, by what they need to run:

- **Unit + integration → bun / vite.** `bun test` for `packages/*` unit tests; Vitest +
  `@cloudflare/vitest-pool-workers` for Worker/DO integration (journal ordering, commit idempotency,
  WS fan-out). These need no external services — fast, run on every change.
- **e2e → Playwright, in `workspaces/tests` (`@byos3/e2e`).** Run with `bun run e2e`. These exercise
  real, containerized infrastructure: a **MinIO** fake bucket (`dev/docker-compose.e2e.yml`) that
  Playwright's `global-setup`/`global-teardown` brings up and tears down. The storage round-trip spec
  mounts MinIO via the `custom` provider and verifies the presigned, direct-to-bucket transfer path;
  browser-driven app flows (Connect → upload → live tree) get added as a second project. Playwright
  runs Node-side, so the suite works in CI containers. Provider compatibility is separately certified
  with **ceph/s3-tests** (`agents/docs/s3-compatibility.md`).
