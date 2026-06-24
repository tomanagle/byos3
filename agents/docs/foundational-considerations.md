# Foundational considerations & lessons from Dropbox

We studied how Dropbox evolved over ~15 years (sync engine, storage, sharing, scaling) to find the
load-bearing decisions we must get right *before* scaffolding — because, in their own words,
**"changing the foundational nouns of a system is often impossible to do in small pieces"**
([rewriting the heart of our sync engine](https://dropbox.tech/infrastructure/rewriting-the-heart-of-our-sync-engine)).
This doc records what we verified, what we changed in response, and what stays open. It is the
rationale behind several decisions in `sync-engine.md`, `namespaces-and-acl.md`, `rbac.md`,
`data-model.md`, and `storage-byo-s3.md`.

## The meta-lesson

Dropbox spent ~4 years (2016–2020) rewriting their sync engine ("Classic" → **Nucleus**, Rust)
because the *data model* — not the code — was wrong: files had **no stable identifier across moves**
and the model **allowed states that aren't valid filesystems**
([Nucleus](https://dropbox.tech/infrastructure/rewriting-the-heart-of-our-sync-engine);
[localfirst.fm interview](https://www.localfirst.fm/23/transcript)). Their distilled advice:
*encode your correctness principles in your data model from day one.* That's what this doc is for.

## Decisions locked from these lessons

### 1. Stable identity; path is a projection
Every node has a stable **GID**; a file is addressed by **(namespaceId, relative path)**, where path
is a *per-user projection*, not identity
([streaming sync](https://dropbox.tech/infrastructure/streaming-file-synchronization)). A move is a
single attribute update → **atomic, independent of subtree size**. We already use GIDs
(`data-model.md`); this confirms it as foundational. *Illegal states (a node with no parent, a cycle,
a node in two places) must be unrepresentable in the journal op model.*

### 2. Cross-user sharing = a shared namespace **mounted**, NOT a subtree grant  ⟵ biggest change
Dropbox models a shared folder as its **own first-class namespace** (its own root, journal, and
membership) that is **mounted** into each member's tree via a **mount table**; the same folder can be
mounted at different paths by different members
([streaming sync](https://dropbox.tech/infrastructure/streaming-file-synchronization),
[sharing guide](https://developers.dropbox.com/dbx-sharing-guide)). They are explicit that
subtree-ACL/grant models are insufficient for cross-user sharing and that *"if you start with subtree
grants you will eventually re-derive namespaces under pressure."*

**Our decision:** cross-user folder sharing is a **shared namespace** (= a Better Auth organization,
which we already use) **mounted into members' roots**, with permissions on the namespace and files
inheriting. The `grant`/`shareLink` mechanism from `rbac.md` is **repositioned** as *intra-namespace
subtree role scoping + public links only* — not the cross-user sharing primitive. This aligns
perfectly with namespace ≡ organization and is cheap to adopt now, ruinous to retrofit later. See the
**mount table** and **home volume** additions in `namespaces-and-acl.md` / `data-model.md`.

**BYO twist (new vs Dropbox):** a shared namespace needs a **home volume** — whose bucket actually
holds the blobs. Collaborators read via presigned URLs brokered by the *home connector*. Implications
we must document: the home account pays egress; if the owner disconnects/rotates/deletes the
connector, shared access breaks; cross-namespace moves become **cross-bucket copies** when home
volumes differ. (Dropbox never had this — they owned all storage.)

### 3. Fixed-size blocks + content addressing — NOT content-defined chunking  ⟵ correction
**Verified:** Dropbox uses **fixed ≤4 MB blocks named by SHA-256**, with **rsync/`librsync`** for
byte-level delta transmission — *not* Rabin/CDC. The CDC claim is a system-design-blog myth; the proof
is their own [Magic Pocket post](https://dropbox.tech/infrastructure/inside-the-magic-pocket) and
open-source [`fast_rsync`](https://github.com/dropbox/fast_rsync/blob/master/README.md) (fixed blocks,
MD4 rolling checksum, SHA-256 verification).

**Our decision (supersedes the earlier "Rabin CDC" plan):** Phase 3 uses **fixed-size blocks** (~4–8 MB,
aligned to S3 multipart parts), content-addressed. Sub-file **byte-delta (rsync/`fast_rsync`-style)** is
**deferred to the desktop daemon**, which has the previous version locally (exactly Dropbox's setup).
Two reinforcing reasons: (a) fixed blocks are simpler to dedup/GC and map to multipart boundaries;
(b) in BYO storage **dedup is per-volume** (per the user's own bucket), so the dedup payoff is far
smaller than Dropbox's global dedup — CDC's complexity isn't justified. The blocklist data model is
unchanged either way. Updated in `sync-engine.md` and `plans/phase-3-chunking-dedup.md`.
(Backup tools — Restic/Kopia/Arq — *do* favor CDC, but only because they **pack** chunks into large
repo objects and dedup **globally**; neither holds for us. The closest-paradigm *sync* tools,
Dropbox and Syncthing, use fixed blocks. Full reconciliation in `prior-art.md`.)

### 4. Append-only per-namespace journal + cursors + **compaction**
Per-namespace monotonic journal (seq = logical clock), client cursors, tombstones as journal rows
([Cape](https://dropbox.tech/infrastructure/introducing-cape)). **Addition:** the journal grows
unbounded and DO SQLite caps at 10 GB, so we need **periodic snapshot + compaction** (truncate ops
older than the minimum live cursor; keep a materialized tree snapshot) and **cold-start from the
snapshot**, not from seq 0. Large-account bootstrap must **paginate** the tree, not download it whole.

### 5. Three-tree merge-base conflict detection
Nucleus stores **observations as three trees** — Remote, Local, and **Synced (the merge base)** — and
*derives* change direction and conflicts structurally
([testing Nucleus](https://dropbox.tech/infrastructure/-testing-our-new-sync-engine)). We already do
the server-side equivalent: a commit declares its `baseVersion`; if it's not the head, it's a conflict
(LWW + conflicted copy). The full three-tree engine lands with the daemon (`sync-engine.md`). Confirmed
foundational.

### 6. Make illegal states unrepresentable + a deterministic, simulation-tested core
Nucleus runs its control logic on a **single deterministic thread** and fuzzes it with millions of
randomized, seed-reproducible runs (CanopyCheck/Trinity) — possible *only because* the core is
deterministic and illegal states are designed away
([testing Nucleus](https://dropbox.tech/infrastructure/-testing-our-new-sync-engine)). **Our posture:**
the journal-op/tree model in `@byos3/core` forbids invalid trees by construction, and the planner/tree
logic is a pure deterministic function (inject time/randomness/IO) so we can property- and
simulation-test it. Added to `conventions.md`.

### 7. GC safety: metadata is the source of truth for liveness
With content-addressed dedup, the classic bug is **deleting a block that's about to be re-referenced**
([Magic Pocket](https://dropbox.tech/infrastructure/inside-the-magic-pocket)). **Our rules:** GC is
gated on the journal (never the block store's own judgment); deletion **lags reference-drop by a grace
period**; and **commit re-verifies chunk existence** (HEAD) — if a deduped chunk is missing (GC race
*or* the user deleted it out-of-band), the client re-uploads. This also handles the untrusted-bucket
case below. Updated in `storage-byo-s3.md`.

### 8. Metadata/content split enables on-demand materialization
A file's *existence* is cheap metadata; its *content* is a separate fetch — which is what makes
placeholder/"online-only" files possible (Dropbox's Smart Sync / Project Infinite,
[Project Infinite](https://dropbox.tech/infrastructure/going-deeper-with-project-infinite)). We already
separate metadata from blobs, so the desktop daemon (Phase 4) can do on-demand materialization. **Note
for Phase 4:** use OS-sanctioned APIs (macOS **File Provider**, Windows **Cloud Filter**), *not* FUSE
or kernel extensions, which Dropbox moved away from.

### 9. Source-of-truth discipline; guard projection caches
Dropbox's [Chrono](https://dropbox.tech/infrastructure/meet-chrono-our-scalable-consistent-metadata-caching-solution)
post shows the classic stale-cache race and the fix: **caches store no authoritative values; reads are
guarded by a monotonic write-intent watermark.** Our DO is the single writer (good), but its
**membership/entitlement projections** (cached from D1) carry the same risk — a stale membership
projection could briefly admit a just-removed member. **Rule:** refresh those projections synchronously
on change (and short TTL), and never treat a projection as authoritative for a security decision without
a freshness check.

### 10. Keep storage provider-agnostic and migration reversible
Dropbox launched on S3, then built Magic Pocket once a single exabyte-scale workload justified it — and
**kept the S3↔Magic Pocket bridge** so the move stayed reversible
([migration analysis](https://www.datacenterdynamics.com/en/analysis/how-dropbox-pulled-off-its-hybrid-cloud-transition/)).
For us, BYO storage is the product, but the lesson maps to keeping the **`StorageDriver` port + capability
flags** clean and the **content-addressing layout portable**, so a volume can be migrated or mirrored.

## BYO-storage considerations Dropbox never had

- **Shared content's home volume + cross-account egress + revocation** (see §2). Document ownership,
  who pays egress, and what happens when the owner disconnects/rotates/deletes a connector.
- **The bucket is mutable and untrusted.** Users (or lifecycle rules, or B2's versioned deletes) can
  remove/alter objects out-of-band → **verify on read, reconcile against the journal, handle missing
  chunks gracefully** (mark "needs re-upload"; never assume a referenced chunk exists).
- **Per-volume dedup only** (no cross-user global dedup) → smaller storage savings; cost is dominated by
  **per-operation pricing + minimum billable object size** (e.g. Hetzner 64 KB). Therefore: **don't
  chunk small files** (store whole), set a sensible minimum block size, and accept per-object overhead.
  Magic-Pocket-style **server-side packing is largely unavailable** to us (we can't compact the user's
  bucket without proxying bytes); client-side packing is a possible later optimization, not MVP.
- **Cross-namespace moves can be cross-bucket copies** when namespaces have different home volumes.

## Open considerations (deferred, but on the record)

- **Cross-namespace causal ordering.** Our per-namespace journal seq doesn't order events *across*
  namespaces; Dropbox uses **Lamport timestamps** for cross-namespace causality (e.g. a delete must
  durably precede a share invitation — [localfirst.fm](https://www.localfirst.fm/23/transcript)). MVP
  accepts per-namespace ordering; revisit for security-sensitive cross-namespace sequences.
- **rsync/`fast_rsync` byte-delta** in the desktop daemon (§3).
- **Client-side small-file packing** as a cost optimization (BYO considerations).
- **Metadata pagination/snapshot** specifics for very large accounts (§4).

## Sources

Nucleus / sync rewrite: https://dropbox.tech/infrastructure/rewriting-the-heart-of-our-sync-engine ·
https://dropbox.tech/infrastructure/-testing-our-new-sync-engine ·
https://www.infoq.com/news/2020/04/dropbox-testing-sync-engine/ ·
https://www.localfirst.fm/23/transcript
Storage/metadata: https://dropbox.tech/infrastructure/inside-the-magic-pocket ·
https://dropbox.tech/infrastructure/streaming-file-synchronization ·
https://dropbox.tech/infrastructure/introducing-cape ·
https://github.com/dropbox/fast_rsync · https://github.com/dropbox/librsync ·
https://dropbox.tech/infrastructure/meet-chrono-our-scalable-consistent-metadata-caching-solution
Sharing/namespaces: https://developers.dropbox.com/dbx-sharing-guide ·
https://developers.dropbox.com/dbx-team-files-guide ·
https://www.dropbox.com/developers/reference/path-root-header-modes
Scaling/migration: https://dropbox.tech/infrastructure/going-deeper-with-project-infinite ·
https://www.datacenterdynamics.com/en/analysis/how-dropbox-pulled-off-its-hybrid-cloud-transition/
