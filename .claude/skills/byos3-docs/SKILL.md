---
name: byos3-docs
description: Routes agents to the right design/architecture doc in agents/docs/ before writing or reviewing byos3 code. Use whenever implementing, modifying, debugging, or reviewing any part of byos3 — the BYO-S3 Dropbox-style file-sync app on Cloudflare Workers (sync engine, storage/S3, auth, billing/subscriptions, namespaces/ACL, web UI, or AI/RAG).
---

# byos3 documentation router

This repo is **docs-first**. `agents/docs/` defines how every part works and how code should be
written; `agents/plans/` holds the phased roadmap. Read the relevant doc **before** coding, and
**update the doc in the same change** when you alter behavior.

## Always start with
- `agents/docs/architecture.md` — the big picture (control plane vs data plane, the splits).
- `agents/docs/foundational-considerations.md` — Dropbox lessons + the load-bearing decisions you must not break.
- `agents/docs/conventions.md` — how code must be written here.
- `agents/docs/code-architecture.md` — how packages/entities/ports fit together (ports & adapters,
  `Volume`/`Connector` facades, composition root, sealed credentials).
- `AGENTS.md` (repo root) — golden rules / invariants.

## Then read the doc for your area
| Task | Doc |
|---|---|
| DB tables, DO storage, schema changes | `agents/docs/data-model.md` |
| Sync, journal, cursors, commit protocol, conflicts | `agents/docs/sync-engine.md` |
| Buckets, presigned URLs, multipart, providers, GC | `agents/docs/storage-byo-s3.md` |
| Per-provider credentials/permissions/quirks | `agents/docs/storage-providers.md` |
| What "S3-compatible" means + compat testing | `agents/docs/s3-compatibility.md` |
| Auth / sessions | `agents/docs/auth.md` |
| Subscriptions, Stripe, entitlements, pricing | `agents/docs/billing.md` |
| Personal/team namespaces, sharing, permissions | `agents/docs/namespaces-and-acl.md` |
| Roles, permissions, authorization (RBAC) | `agents/docs/rbac.md` |
| API surface, API keys, OpenAPI (API-first) | `agents/docs/api.md` |
| Web UI (TanStack Start + shadcn/ui) | `agents/docs/web-app.md` |
| Routes, auth flow, waitlist gate, shell layout | `agents/docs/routing.md` |
| RAG / embeddings (later) | `agents/docs/ai-rag.md` |
| Logging / observability (wide events) | `agents/docs/logging.md` |
| Secrets management (SOPS/age) | `agents/docs/secrets.md` |
| Deployment, CI/CD, Pulumi, oxlint/oxfmt/lefthook | `agents/docs/deployment.md` |
| Monorepo, Bun-vs-Wrangler, builds, testing | `agents/docs/monorepo.md` |
| Competitors / prior art / positioning | `agents/docs/prior-art.md` |

## Non-negotiable invariants (full list in AGENTS.md)
1. Bytes never flow through the Worker (except the opt-in, plan-gated AI indexer).
2. Metadata path ≠ blob path; files are blocklists of SHA-256-addressed chunks.
3. The `Namespace` Durable Object is the single writer; journal seq = logical clock.
4. Commit references hashes only, after blobs are durable; uploads are idempotent two-phase.
5. No business logic in transport layers; contracts are Zod schemas in `packages/protocol`.
6. We monetize the service, not storage GB.

If a doc and the code disagree, treat it as a bug and reconcile — don't silently follow either.
