# Conventions — how to write code here

This is the house style. It exists so any agent or human produces code that fits. Read it before
coding; follow it unless a doc for the specific area says otherwise.

## Language & types

- **TypeScript, `strict` everywhere.** No `any` in committed code (`unknown` + narrowing is fine).
  No non-null `!` unless provably safe with a comment.
- **Schemas are the source of truth.** Every cross-boundary shape (API request/response, journal
  op, cursor, config record) is a **Zod schema in `packages/protocol`**. Derive types with
  `z.infer`. Never hand-author a type that duplicates a schema.
- **Validate at the boundary, trust within.** Parse inputs with Zod at the edge (server function,
  HTTP route, DO message, webhook). Internal functions receive already-typed values.
- **IDs are typed and prefixed** (`ns_…`, `node_…`, `vol_…`, `conn_…`, `dev_…`). Use branded
  string types so a `VolumeId` can't be passed where a `NodeId` is expected.

## Layering (the most-violated rule)

> Full structure — ports & adapters, entities, the composition root, sealed credentials — is in
> `code-architecture.md`. The rules below are the enforceable summary.

- **No business logic in transport layers.** TanStack server functions and `/api/v1` route
  handlers are thin: parse input → call a `packages/core` function → shape the response. If a
  handler is more than glue, the logic belongs in a package.
- **Package boundaries:** `core` (sync/chunking/journal logic, pure & isomorphic), `s3` (signing
  & provider adapters), `protocol` (schemas), `crypto` (credential encryption), `ui` (components),
  `ai` (later). `core` must stay runtime-agnostic (no Worker- or Bun-specific globals) so it runs
  on the server, in the browser, and in the future desktop daemon.
- **Imports flow one way:** apps → packages; `core`/`protocol` import nothing app-specific.

## Durable Object discipline

- The DO is the **single writer** for its namespace. All mutations go through it; never write
  namespace metadata from a plain Worker path.
- **Every mutation appends to the journal** and bumps the sequence. The seq is the only logical
  clock — don't add timestamps-as-ordering.
- Keep DO methods **short and transactional**; offload hashing/IO to the client or a Queue.
- Use the **WebSocket Hibernation API** (`state.acceptWebSocket`), never `ws.accept()`, so idle
  connections don't accrue billing.

## Storage & sync invariants (enforce in code)

- **Bytes never through the Worker.** Mint presigned URLs; let the client transfer. (Sole
  exception: the AI indexer — see `ai-rag.md`.)
- **Commit references hashes, only after blobs are durable.** Two-phase: missing-check → upload →
  commit. Make commits **idempotent** (re-committing the same blocklist is a no-op).
- **Trust client-computed SHA-256, not provider ETags** (ETag ≠ content hash for multipart).
- **Content addressing & the chunk index are per-volume.** Always thread `volumeId`.
- **Make illegal states unrepresentable; keep the sync core deterministic.** The journal-op/tree
  model must forbid invalid trees (no orphan, cycle, or duplicate location); planner/tree logic is a
  pure deterministic function (inject time/randomness/IO) so it can be property/simulation-tested.
  Dropbox's load-bearing lesson — see `foundational-considerations.md` §1, §6.

## Errors

- Throw typed errors from `core` (a small `AppError` union with a `code`); map to HTTP/status at
  the edge. Never leak provider error text or credentials to clients or logs.
- Background jobs must be **retry-safe / idempotent** (Queues retry; Workflows replay steps).

## Logging (wide events)

- **One wide event per request/hop, emitted once** — never scattered `console.log` lines. Build
  the event through the request and `emit()` it in a `finally`. Use `@byos3/logging`; enrich the
  current event with business context instead of adding a log statement. Full rules:
  `agents/docs/logging.md`.

## Security

- **Encrypt connector credentials at rest** (`packages/crypto`, envelope encryption under a Worker
  secret). Never log secrets, access keys, or presigned URLs.
- Presigned URLs are **bearer tokens**: short TTL (minutes), pin `Content-Type` (and
  `Content-Length` where possible), scope to one exact key.
- Authorize every namespace operation with `requirePermission` (edge) and `authorize()` (DO) — the
  RBAC use-case in `@byos3/core/authz`; never inline `role === …` checks. See `rbac.md`.
- **One authorization model, two auth methods.** A unified middleware resolves a **session** (web) or
  **API key** (programmatic) to a `Principal`; authorize identically. API-key requests also pass the
  key's scopes (∩ with the role). byos3 is **API-first** — every capability is reachable via
  `/api/v1`; web server functions and `/api/v1` are both thin over `@byos3/core`. See `api.md`.

## Testing

- `bun test` for pure packages (`core`, `s3`, `protocol`, `crypto`). Aim for unit coverage of
  chunking, blocklist diffing, conflict detection, SigV4 signing, cursor math.
- **Vitest with the Cloudflare Workers pool** for Worker + DO behavior (journal ordering, commit
  idempotency, WebSocket fan-out).
- **S3 client conformance** runs against a **local MinIO** container; new providers are certified
  with the **ceph/s3-tests** profile before being enabled. See `s3-compatibility.md`.
- A change to a feature includes updating its doc in `agents/docs/` in the same change.

## Style

- Prettier defaults; named exports (no default exports except where a framework requires).
- Comments explain *why*, not *what*. Match the density of surrounding code.
