# AGENTS.md — byos3

Canonical instructions for any AI agent (Claude Code, Codex, Cursor, …) working in this repo.
`CLAUDE.md` defers to this file. Read it before writing or reviewing code.

## What this is

**byos3** is a Dropbox/Google-Drive-style file storage & sync app with a twist: users **bring
their own S3-compatible bucket** (AWS S3, Cloudflare R2, or Backblaze B2). We are the *control
plane*; their bucket is the *data plane*. The whole thing runs on Cloudflare Workers as a
monorepo.

## Golden rules (invariants — violating these is a bug)

1. **Bytes never flow through the Worker.** Clients upload/download directly to the user's
   bucket via short-lived presigned URLs the Worker mints. The only sanctioned exception is the
   plan-gated, opt-in AI indexer (see `agents/docs/ai-rag.md`).
2. **Metadata and blobs are separate paths.** A file is metadata (a path + an ordered list of
   content hashes — a *blocklist*); content is immutable, content-addressed objects in the
   user's bucket keyed by SHA-256.
3. **The Durable Object is the single writer.** All mutations for a namespace are serialized by
   its `Namespace` DO. The journal sequence number is the logical clock — don't invent another.
4. **Commit references hashes, never bytes, and only after blobs are durable.** Upload is
   two-phase: ask which chunks are missing → upload them → commit the blocklist. Idempotent.
5. **No business logic in transport layers.** TanStack server functions and `/api/v1` HTTP
   routes are thin wrappers over `packages/core`. Logic lives in packages, not in the edges.
6. **Contracts are Zod schemas in `packages/protocol`.** Both client and server import them.
   Never hand-write a type that should be derived from a schema.
7. **The user's bucket is mutable and untrusted as a source of truth** — reconcile against the
   journal; trust client-computed SHA-256, not provider ETags (ETag ≠ content hash on multipart).
8. **Storage is BYO, so we don't sell GB.** We monetize the *service* (devices, seats, history
   depth, AI). Entitlements gate features, never raw storage size.
9. **One wide event per request/hop — never scattered log lines.** A single request builds one
   large structured event, emitted once at the end. See `agents/docs/logging.md`.
10. **API-first.** Everything the web can do is doable via the versioned **`/api/v1`** with an **API
   key**. Session (web) and API key (programmatic) are two *authentication* methods over one
   *authorization* model (RBAC) and one core. See `agents/docs/api.md`.

## Repo structure

```
apps/
  web/        TanStack Start app — IS the Worker. Hosts the Namespace DO (src/server.ts),
              React UI, server functions (web data layer), and /api/v1 HTTP routes (daemon contract).
  desktop/    (Phase 4) native sync daemon — not built yet.
packages/
  ui/         shadcn/ui components + Tailwind preset (shared design system).
  core/       chunking, SHA-256, blocklist, journal ops, three-tree diff, conflict logic.
  s3/         aws4fetch SigV4, presign, multipart, per-provider (S3/R2/B2) adapters.
  protocol/   Zod schemas: journal ops, sync cursor, API contracts. Single source of truth.
  crypto/     envelope encryption for BYO credentials; E2E seam.
  logging/    wide-event logger (one canonical event per request/hop).
  ai/         (Later) Workers AI + Vectorize RAG pipeline. Dormant.
agents/
  docs/       How every part works + how to write code here. READ FIRST.
  plans/      The phased build roadmap.
```

## Doc map — read the relevant doc before touching that area

| Working on… | Read |
|---|---|
| Anything (start here) | `agents/docs/architecture.md` |
| Why the foundations are shaped this way (Dropbox lessons) | `agents/docs/foundational-considerations.md` |
| Competitors, prior art, positioning | `agents/docs/prior-art.md` |
| **How to write code here** | `agents/docs/conventions.md` |
| **How the code is structured (packages, entities, ports)** | `agents/docs/code-architecture.md` |
| DB / DO storage / schemas | `agents/docs/data-model.md` |
| Sync, journal, cursor, commit, conflicts | `agents/docs/sync-engine.md` |
| Buckets, presigning, multipart, providers, GC | `agents/docs/storage-byo-s3.md` |
| Per-provider credentials, permissions, quirks | `agents/docs/storage-providers.md` |
| What "S3-compatible" means + compat testing | `agents/docs/s3-compatibility.md` |
| Login / sessions | `agents/docs/auth.md` |
| Payments / plans / entitlements | `agents/docs/billing.md` |
| Personal vs team, sharing, permissions | `agents/docs/namespaces-and-acl.md` |
| Roles, permissions, authorization (RBAC) | `agents/docs/rbac.md` |
| API surface, API keys, OpenAPI (API-first) | `agents/docs/api.md` |
| Web UI, TanStack Start, shadcn | `agents/docs/web-app.md` |
| Routes, auth flow, waitlist gate, shell layout | `agents/docs/routing.md` |
| RAG / embeddings (later) | `agents/docs/ai-rag.md` |
| Logging / observability | `agents/docs/logging.md` |
| Secrets (SOPS/age), .dev.vars, prod deploy | `agents/docs/secrets.md` |
| CI/CD, Pulumi IaC, GitHub Actions, oxlint/oxfmt/lefthook | `agents/docs/deployment.md` |
| Monorepo, Bun vs Wrangler, builds | `agents/docs/monorepo.md` |

## How to work here

- **Docs are normative, not descriptive.** If you change how a feature behaves, update its doc
  in the same change. If code and docs disagree, that's a bug to resolve, not ignore.
- **Plans → docs → code.** Pick the active phase in `agents/plans/`, confirm the design in
  `agents/docs/`, then implement. Keep `agents/plans/README.md` status current.
- A doc explains **how the feature works** + **key decisions** + **gotchas** + **where the code
  lives**. Keep that shape.

## Tooling (see `agents/docs/monorepo.md` for detail)

- **Bun** = package manager, workspaces, and test runner for pure packages. **Workers do NOT run
  on Bun** — no `Bun.serve`/`bun:sqlite`/`Bun.sql` inside the Worker.
- **Wrangler / `@cloudflare/vite-plugin`** = dev & deploy the Worker. `npm run dev`,
  `npm run deploy`, `npm run cf-typegen` (binding types).
- `bun test` for `packages/*`; Vitest Workers pool for Worker/DO code.
