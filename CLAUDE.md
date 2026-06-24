# CLAUDE.md — byos3

**Read [`AGENTS.md`](./AGENTS.md) first** — it is the canonical guide for working in this repo
(architecture, golden rules, doc map, conventions). This file only adds Claude-specific notes.

## Before you code

1. Read [`AGENTS.md`](./AGENTS.md) and the relevant doc(s) in [`agents/docs/`](./agents/docs/).
   The doc map in `AGENTS.md` says which doc covers which area.
2. Check the active phase in [`agents/plans/`](./agents/plans/).
3. The `byos3-docs` skill routes you to the right doc for a task — use it.

## Docs are normative

Documentation in `agents/docs/` defines intended behavior and the house coding style. When you
change behavior, update its doc in the same change. Code-vs-doc disagreement is a bug.

## Tooling nuance (inherited Bun default + Workers reality)

The parent `CLAUDE.md` defaults everything to Bun. That holds for **tooling** — package
management, workspaces, scripts, and `bun test` for `packages/*`. But the app deploys to
**Cloudflare Workers (workerd), not the Bun runtime**: inside `apps/web` do **not** use
`Bun.serve`, `bun:sqlite`, `Bun.sql`, or `Bun.redis`. Use Workers primitives instead — Durable
Object SQLite, D1, R2, KV — and dev/deploy with Wrangler + `@cloudflare/vite-plugin`. See
[`agents/docs/monorepo.md`](./agents/docs/monorepo.md).

## The one rule people forget

**Bytes never pass through the Worker.** Clients transfer files directly to the user's bucket via
presigned URLs. If you find yourself streaming file content through a Worker, stop and re-read
[`agents/docs/storage-byo-s3.md`](./agents/docs/storage-byo-s3.md).
