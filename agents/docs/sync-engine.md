# Sync engine

How files are modeled, transferred, versioned, synced across devices, and reconciled. This is the
heart of the product; read it fully before touching `packages/core` or the `Namespace` DO.

## A file is a blocklist

A file's content is an **ordered list of chunk hashes** (`blocklist`): `[{hash, size}, …]`.
Content is **immutable and content-addressed** - a chunk's object key *is* its SHA-256
(`<volume.prefix>/chunks/<sha256>`). The logical tree (paths, names, parentage) is pure metadata
pointing at blocklists. This one decision buys dedup, delta transfer, integrity, and atomic
versioning.

**Phase 1 chunker = whole file** (one chunk = the file). **Phase 3 chunker = fixed-size blocks**
(~4–8 MB, aligned to S3 multipart parts), content-addressed by SHA-256 - the **same model Dropbox
uses** (fixed ≤4 MB blocks, *not* content-defined/Rabin chunking; verified - see
`foundational-considerations.md` §3). Sub-file **byte-level delta** (rsync/`fast_rsync`-style) is
**deferred to the desktop daemon**, which has the previous version locally. *The blocklist model
does not change* - only the chunker in `packages/core` and the download reassembler. Note: in BYO
storage dedup is **per-volume**, so the payoff is smaller than Dropbox's global dedup - another
reason fixed blocks suffice and CDC isn't worth its complexity. See
`plans/phase-3-chunking-dedup.md`.

## The journal (authoritative state)

Each namespace's DO holds an **append-only journal** (`journal` table). Every mutation is one op,
assigned a monotonically increasing `seq`. **`seq` is the logical clock** - there is no other
ordering. The materialized `node`/`version` tables are derived from the journal.

Op union (Zod in `packages/protocol`), e.g.: `createFolder`, `createFile`, `addVersion`,
`rename`, `move`, `delete`, `restore`, `mountVolume`, `setAiEnabled`. Each op carries the actor
device, target `gid`, and op-specific fields. Ops are **idempotent by `(gid, expectedParentSeq)`**
where relevant. **Invalid trees must be unrepresentable** - an op can never leave a node without a
parent, in two places, or in a cycle (Dropbox's hardest-won lesson; see
`foundational-considerations.md` §1, §6).

### Journal compaction & cold start
The journal is append-only and the DO's SQLite caps at 10 GB, so it cannot grow forever. Periodically
**snapshot** the materialized tree and **compact** - drop journal rows older than the *minimum live
cursor* across known devices (keep tombstones long enough for offline devices to observe deletions).
**Cold start / recovery loads the snapshot, then pulls the journal tail** - never replays from `seq 0`.
Large accounts **paginate** the tree snapshot rather than downloading it whole.

## Cursor sync

The **cursor** = last `seq` a client has applied.

- **Pull:** client sends cursor → DO returns ops with `seq > cursor` (and the new head seq) →
  client applies them and advances. Cold start / recovery = load the latest tree snapshot, then pull
  the journal tail (never from `seq 0`, which is compacted away).
- **Push:** see commit protocol below; a successful commit returns the new head seq.

## Two-phase commit (upload)

Blocks before metadata, always:

1. **`commit-intent`** - client computes the blocklist (hash locally) and sends it + the target
   `volumeId`. The DO checks `chunk_index` for that volume and replies with the **missing hashes**
   plus **presigned PUT URLs** (one per missing chunk; multipart for large ones - `storage-byo-s3.md`).
2. **Upload** - client PUTs only the missing chunks **directly to the volume's bucket**. Existing
   chunks are skipped (dedup).
3. **`commit`** - client calls commit with the blocklist. The DO verifies all chunks are present
   (HEAD or trust the intent round-trip), appends an `addVersion`/`createFile` op, bumps refcounts
   in `chunk_index`, and returns the new head seq.

Properties: **idempotent** (re-committing the same blocklist is a no-op), **resumable** (re-run
intent to learn what's still missing), and metadata is committed **only after blobs are durable**.

## Download

Client reads the node's current `blocklist` from the DO → for each chunk it lacks locally,
fetches via **presigned GET** from the node's volume → reassembles in order. Delta download falls
out naturally once chunking is on (only missing chunks transfer).

## Change notification & live UI

The Namespace DO maintains **hibernating WebSockets** for connected clients (browser tabs + the
desktop daemon). It carries two kinds of messages - **never file content**:

- **Durable poke (journaled).** On a successful `commit` the DO appends the op and sends every
  connected socket a lightweight poke ("head is now seq N"); clients pull deltas via cursor
  (`seq > myCursor`) and apply them. This is what makes *"upload a file in one window → it appears
  in every window and device"* work - the committed op propagates to all cursors.
- **Ephemeral transfer events (NOT journaled).** Transfer progress is transient presence, not state,
  so it is broadcast but never written to the journal. On `commit-intent` the DO broadcasts
  `transfer.start {gid, name, volumeId, by}`; the uploading client relays throttled
  `transfer.progress {gid, pct}` over its own socket and the DO re-broadcasts it; `commit` ends it
  with the durable poke. Other windows render the file as *uploading… N%* immediately, then
  materialize it for real on the poke. Progress is best-effort and self-expiring (a stale transfer
  times out client-side).

**Connection + authorization.** The browser opens `wss://…/ns/{namespaceId}/socket`; the **Worker**
authenticates (session or API key) and confirms namespace membership BEFORE upgrading, then forwards
the `Upgrade` to `env.NAMESPACE.get(idFromName(namespaceId))`. (apps/web binds the DO directly;
apps/api reaches it via a service binding to apps/web.) The DO tags each socket with its principal
so it can scope which subtree events a reader is allowed to see. Hibernation means idle tabs cost
nothing - ephemeral traffic only flows during active transfers.

## Conflict resolution

**No auto-merge. Last-writer-wins + a preserved conflicted copy.** A commit declares the
`baseVersionId` (or base seq) it edited from. If that's no longer the node's head, it's a conflict:
the incoming content is materialized as a sibling `name (conflicted copy <device> <date>).ext` and
both are kept. Detection is structural and happens in the DO at commit time.

## Cross-volume move

Moving a node between volumes is **not** a metadata-only rename (chunks can't be referenced across
buckets). It's: copy the node's chunks from the source bucket to the target bucket (a Queue/Workflow
job; R2's zero egress makes it a cheap target), then commit a `move` that updates `volumeId`. Until
the copy completes the node stays on its source volume.

## Reconciliation

The user's bucket is mutable outside our control. A periodic **Workflow** (Cron-triggered) lists
each volume and reconciles against the journal - detecting externally added/removed objects and
flagging drift. The journal stays authoritative; reconciliation surfaces divergence, it doesn't
silently overwrite user intent.

## Future: the three-tree client (Phase 4)

The native daemon uses Dropbox's model - **Remote**, **Local**, and last-**Synced** trees, with
Synced as the merge base - to decide change direction and detect conflicts on a real filesystem.
The server side (journal + cursor + commit) is unchanged. See `plans/phase-4-desktop-daemon.md`.
