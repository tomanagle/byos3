# Monorepo, tooling & builds

## Layout

```
apps/
  web/        TanStack Start app — IS the Worker (hosts the Namespace DO, UI, server fns, /api/v1)
  desktop/    (Phase 4) native sync daemon
packages/
  ui/         shadcn/ui components + Tailwind preset
  core/       sync/chunking/journal logic — pure, isomorphic (server + browser + daemon)
  s3/         aws4fetch SigV4, presign, multipart, provider adapters (S3/R2/B2)
  protocol/   Zod schemas: journal ops, cursor, API contracts
  crypto/     envelope encryption for connector creds; E2E seam
  logging/    wide-event logger (one canonical event per request/hop)
  ai/         (Later) Workers AI + Vectorize RAG pipeline
agents/       docs/ + plans/  (this documentation)
```

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

## Testing

- `bun test` — `packages/*` unit tests.
- Vitest + `@cloudflare/vitest-pool-workers` — Worker/DO integration (journal ordering, commit
  idempotency, WS fan-out).
- `packages/s3` conformance round-trips our operation set against a **local MinIO** container;
  provider compatibility is certified with **ceph/s3-tests** (`agents/docs/s3-compatibility.md`).
