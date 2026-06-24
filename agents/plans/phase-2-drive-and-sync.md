# Phase 2 — A real drive & multi-device sync

**Goal:** turn the flat list into a real drive — folder tree, versioning, multi-device cursor
sync, real-time notifications — across one or more mounted volumes.

Design refs: `sync-engine.md`, `data-model.md`, `namespaces-and-acl.md`, `web-app.md`.

## Scope (in)

- Full journal op set: `createFolder`, `createFile`, `addVersion`, `rename`, `move`, `delete`,
  `restore`, `mountVolume`. Stable node **GIDs** (moves/renames are O(1)).
- Folder tree UI; breadcrumb navigation.
- **Multiple volumes mounted in one namespace**; per-node `volumeId`; a **volume picker** to choose
  the drop target; default-volume setting. (the multi-connector requirement)
- Versioning + version-history view; conflict handling (LWW + conflicted copy).
- **Cursor sync + journal durability:** `pull(cursor) → ops`; **snapshot + compaction** (drop
  journal rows below the min live cursor; retain tombstones for offline devices) to keep the DO
  within its 10 GB SQLite limit; **cold-start from snapshot** (never `seq 0`); paginate large trees.
  (`foundational-considerations.md` §4)
- **Real-time:** hibernating WebSocket per namespace; "poke" → clients pull deltas; TanStack Query
  invalidation.
- Device registry (`device` table) — foundation for device-count entitlement.
- Basic reconciliation Workflow (Cron) listing each volume vs the journal, flagging drift.
- Add B2 and AWS S3 adapters in `packages/s3` (provider matrix in `storage-byo-s3.md`).

## Tasks

1. Implement op handlers + journal append + materialized `node`/`version` updates in the DO.
2. Cursor pull endpoint + tree **snapshot + journal compaction** (min-live-cursor retention);
   cursor encode/decode in `protocol`.
3. WebSocket hibernation hub in the DO; poke on commit; client WS hook in `apps/web`.
4. Tree + version-history + conflict UI; volume picker + per-item volume badge.
5. `mountVolume` flow; multi-volume `commit-intent` (chunk index keyed by `volumeId`).
6. Reconciliation Workflow + Cron trigger.
7. B2 + S3 adapters; CORS preset helpers per provider.
8. Certify each new provider with the **byos3 ceph/s3-tests profile** before enabling it; record
   its capability flags in `storage-providers.md`. `requiresProxy` providers (e.g. OCI — no CORS)
   are **web-unsupported in MVP**; record the flag. See `agents/docs/s3-compatibility.md`.

9. **API keys + OpenAPI**: Better Auth `apiKey` plugin — create/list/rotate/revoke (web + `/api/v1`),
   per-key **scopes** (∩ RBAC), rate limits, expiry; finalize the unified session-or-key auth
   middleware; generate **OpenAPI** from `@byos3/protocol`. See `agents/docs/api.md`.

## Acceptance criteria

- Edits on device A appear on device B within seconds **without a full rescan** (cursor delta +
  WS poke).
- A namespace with an R2 volume **and** a B2 volume works; a file can be dropped to either; its
  badge shows the right volume; download pulls from the right bucket.
- Concurrent edits produce a `conflicted copy`, never silent data loss.
- Rename/move of a large folder is a single fast metadata op (GID-based).
- Reconciliation flags an object deleted out-of-band in the bucket.
- Each newly enabled provider passes the byos3 ceph/s3-tests compatibility profile before going live.
- A scoped API key can drive the full file lifecycle via `/api/v1` and cannot exceed its owner's role
  (a read-only key is refused writes).
