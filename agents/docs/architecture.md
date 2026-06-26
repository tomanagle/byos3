# Architecture

The one idea everything hangs on: **the metadata/control path is fully separate from the
content/blob path.** We own the control plane (on Cloudflare); the user owns the data plane
(their bucket). Bytes never pass through us.

## Two planes

```
              ┌──────────────── CONTROL PLANE (ours, Cloudflare) ─────────────────┐
  ┌────────┐  │  ┌──────────────┐     ┌───────────────────────────┐  ┌─────────┐  │
  │ Client │──┼─▶│ Worker        │────▶│ Namespace Durable Object  │  │   D1    │  │
  │ (web)  │◀─┼─▶│ (TanStack     │◀───▶│ • journal (append-only)   │  │ accounts│  │
  └───┬────┘WS │  │  Start app):  │     │ • tree (nodes + versions) │  │ members │  │
      │        │  │  server fns + │     │ • per-volume chunk index  │  │ connect.│  │
      │ presign│  │  /api/v1 +    │     │ • entitlement cache       │  │ volumes │  │
      │  URLs  │  │  Namespace DO │     │ • hibernating WS hub      │  │ subs    │  │
      │        │  │  + aws4fetch  │     └───────────────────────────┘  └─────────┘  │
      │        │  └──────┬────────┘                                                 │
      │        └─────────┼──────────────────────────────────────────────────────────┘
      │  bytes (direct)  │ mints short-lived presigned PUT/GET (SigV4) for the node's volume
      ▼                  ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  VOLUMES = the user's own buckets  (DATA PLANE)                │
  │  R2: <prefix>/chunks/<sha256>   ·   B2: <prefix>/chunks/<...>  │  ← many per account
  └──────────────────────────────────────────────────────────────┘
```

- **Control plane** - auth, the file namespace/tree, versions, sync coordination, presigning,
  billing. Runs entirely on Cloudflare. Handles only tiny metadata payloads.
- **Data plane** - the actual file bytes, content-addressed in the user's bucket(s). The client
  transfers directly to/from the bucket using presigned URLs. We never proxy bytes (see golden
  rule #1 in `AGENTS.md`) - Workers aren't a byte proxy, and *the user pays their own egress*.

## Core concepts

- **File = blocklist.** A file's content is an ordered list of SHA-256 chunk hashes. Content is
  immutable and addressed by hash. This gives dedup, delta transfer, and integrity for free. See
  `sync-engine.md`.
- **Connector / Volume.** A *connector* is an encrypted provider credential; a *volume* is a
  mountable drive (connector + bucket + prefix). A user can mount several. Each node records its
  `volumeId`; dedup/GC/presigning are per-volume. See `storage-byo-s3.md`.
- **Namespace.** The unit of sync, sharing, membership, billing reference, and the Durable
  Object. Owned by a user (personal) or team. Mounts one or more volumes. See
  `namespaces-and-acl.md`.
- **Journal.** Per-namespace append-only log in the DO. Its sequence number is the logical clock;
  clients sync via an opaque cursor. See `sync-engine.md`.

## Cloudflare primitive map

| Concern | Primitive |
|---|---|
| Per-namespace journal + tree + real-time hub | **Durable Object** (one per namespace), SQLite inside |
| Global tables (accounts, members, connectors, volumes, subscriptions) | **D1** |
| Auth | **Better Auth** (D1 adapter, KV sessions) |
| Web app + server functions + HTTP API + DO host | **TanStack Start** on Workers |
| Sign presigned URLs to the user's buckets | **aws4fetch** (SigV4) |
| Background jobs (reconcile, GC, thumbnails, AI index) | **Queues + Workflows + Cron** |
| Optional dedup/thumbnail cache | **R2** (zero egress) |
| RAG (later) | **Workers AI + Vectorize** |

## Request flows (summary)

- **Upload:** client hashes file → `commit-intent` (server returns missing chunk hashes +
  presigned PUTs for the target volume) → client PUTs missing chunks direct to bucket → `commit`
  (DO appends a version to the journal). Two-phase, idempotent. Detail: `sync-engine.md`.
- **Download:** client reads blocklist from the DO → fetches chunks via presigned GET from the
  node's volume → reassembles.
- **Sync:** client sends cursor → DO returns ops since → client advances. A WebSocket "poke"
  tells idle clients to pull.

## Scaling risk to design around

A single hot namespace DO is a serialization bottleneck. Keep a sharding escape hatch (e.g.
shard a very large namespace by folder subtree). Don't prematurely shard - just don't preclude it.
