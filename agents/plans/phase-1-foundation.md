# Phase 1 — Foundation

**Goal:** prove the BYO + direct-transfer model end to end. Auth, connect a bucket (connector +
volume), upload/download a whole file via presigned URLs, see it in a flat list. Smallest thing
that validates the core bet. (Builds on the Phase 0 scaffold — workspace, `apps/web`, D1, deploy
already exist.)

Design refs: `architecture.md`, `storage-byo-s3.md`, `data-model.md`, `monorepo.md`,
`conventions.md`, `logging.md`.

## Scope (in)

- Extend the Phase 0 scaffold (workspace, `apps/web`, D1, deploy exist): stub
  `packages/{protocol, s3, core, crypto, logging}` (`ui` already exists).
- Auth (Better Auth + D1) with email/password; default personal namespace + `owner` member on
  signup. (`auth.md`)
- Connectors & volumes: connect one provider (start with R2), encrypt creds (`crypto`), validate
  with `HeadBucket`, mount one volume, set as default. (`storage-byo-s3.md`)
- Upload (whole-file): client SHA-256 → `commit-intent` (presigned PUT) → direct PUT to bucket →
  `commit`. Store a single-chunk blocklist. Multipart for files > part threshold.
- Download: presigned GET → reassemble.
- Flat file list per volume (no folders yet) backed by the `Namespace` DO.
- `@byos3/logging` wide-event middleware emitting one event per request.

## Scope (out)

Folder tree, versioning history UI, cursor sync across devices, WebSockets, block-level dedup
(fixed-size blocks land in Phase 3), billing, sharing, teams, AI. (Schema still models files as
**blocklists** so Phase 3 is a chunker swap.)

## Tasks

1. Stub `packages/{protocol,s3,core,crypto,logging}` in the existing workspace; wire `bun test`.
2. Add the `NAMESPACE` Durable Object binding to `wrangler.jsonc` (D1 + `nodejs_compat` already set
   in Phase 0); `cf-typegen`.
3. `packages/protocol`: Zod schemas for connector/volume, `commit-intent`/`commit`, blocklist,
   cursor. Branded IDs.
4. `packages/s3`: aws4fetch SigV4 presign (PUT/GET), multipart helpers, R2 adapter.
5. `packages/crypto`: envelope encryption for connector creds.
6. `packages/core`: whole-file chunker (one chunk), SHA-256, blocklist build/verify.
7. `Namespace` DO: SQLite schema (`journal`, `node`, `version`, `chunk_index`, `device`), commit
   protocol, flat list query.
8. Server fns + `/api/v1` (both thin over `@byos3/core`) for connectors/volumes + upload/download;
   a **unified auth middleware** → `Principal` (session now; API keys land in Phase 2). API-first.
9. Web UI: sign in, connect bucket, upload (drag-drop), list, download. shadcn via `@byos3/ui`.
10. `packages/s3` conformance test round-tripping our operation set + presign + multipart against a
    **local MinIO** container (CI fixture). See `agents/docs/s3-compatibility.md`.

## Acceptance criteria

- A new user can sign up, connect an R2 bucket, upload a file, and download it back — **bytes go
  browser↔bucket, never through the Worker** (verify in network logs).
- Re-uploading an identical file uploads **zero** chunks (dedup hit on `chunk_index`).
- Credentials are stored encrypted; no secret or presigned URL appears in logs.
- Each request emits exactly **one** wide event with `op`, `volume_id`, `bytes`, `chunks_missing`.
- `bun test` covers SigV4 signing, blocklist build, commit idempotency.
- `packages/s3` conformance suite passes against local MinIO (probe/put/head/get/list/multipart/presign/delete).
- Every Phase-1 capability is reachable via `/api/v1` (session-auth), not only via server functions (API-first parity).
