# Phase 4 - Native desktop sync daemon

**Goal:** a real filesystem sync client (the true Dropbox experience): a local folder that mirrors
a namespace, with background sync, selective sync, and conflicted copies. Reuses the server side
unchanged (`/api/v1` + the journal/cursor/commit protocol).

Design refs: `sync-engine.md` (three-tree model), `web-app.md` (the `/api/v1` contract),
`conventions.md` (isomorphic `core`).

## Approach

- Shell: **Tauri** (smaller, native) or **Electron** (reuses TS/`@byos3/ui` directly) - decide at
  phase start. Either way the sync logic is `@byos3/core` (already isomorphic).
- **Three-tree engine:** maintain **Remote**, **Local**, and last-**Synced** trees; Synced is the
  merge base used to decide change direction and detect conflicts (per `sync-engine.md`).
- File watcher → local change detection; debounce; hash via `core`.
- Speaks the **stable `/api/v1`** contract (NOT TanStack server functions): cursor pull, WS poke,
  two-phase commit, presigned transfer direct to the node's volume.

## Scope (in)

- Initial scan + ongoing watch; selective sync (choose folders/volumes to materialize).
- Conflict handling consistent with the server (LWW + `conflicted copy`).
- Device registration + counts toward entitlement (`billing.md`).
- Offline queue; resume on reconnect (commit protocol is resumable/idempotent).

## Tasks

1. Choose shell; scaffold `apps/desktop`; embed `@byos3/core` + `@byos3/s3`.
2. Implement the three-tree differ + planner (what to upload/download/rename/delete).
3. Filesystem watcher + hashing pipeline; backpressure.
4. Wire `/api/v1` client (auth token, cursor, WS, presigned transfer).
5. Selective sync + settings UI.

## Acceptance criteria

- A file dropped in the local folder appears in the web app (and other devices) and vice-versa.
- Offline edits sync correctly on reconnect; concurrent edits produce conflicted copies.
- Selective sync materializes only chosen subtrees; bytes go direct to the bucket.
- The daemon uses **only** `/api/v1` - no dependency on web-only server functions.
