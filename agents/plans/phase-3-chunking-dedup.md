# Phase 3 — Fixed-size blocks, dedup & safe GC

**Goal:** sub-file dedup + safe garbage collection. Swap the whole-file chunker for **fixed-size
blocks** (~4–8 MB, aligned to S3 multipart parts), content-addressed, so identical blocks dedup and
only changed blocks transfer; GC unreferenced blocks safely. **The blocklist data model does not
change** — a chunker + reassembler swap plus GC. (Dropbox uses **fixed blocks + rsync deltas, not
CDC/Rabin** — verified in `agents/docs/foundational-considerations.md` §3. Sub-file byte-delta is
deferred to the desktop daemon, which has the old version locally.)

Design refs: `sync-engine.md`, `storage-byo-s3.md`, `data-model.md`.

## Scope (in)

- **Fixed-size block chunker** in `@byos3/core` (~4–8 MB, aligned to multipart part size; a
  sensible minimum so tiny files stay whole). Deterministic and isomorphic (browser + server +
  future daemon).
- Delta **upload**: `commit-intent` returns only the chunks missing for that **volume**
  (`chunk_index` keyed by `volumeId`); client uploads just those.
- Delta **download**: client fetches only chunks it lacks locally; reassembles in order.
- **Refcounting** in `chunk_index` on commit and on version expiry.
- **GC Workflow**: mark-sweep chunks at refcount 0 past the plan's history window; delete from the
  volume's bucket. Idempotent and conservative. Deletion **lags refcount-drop by a grace period**;
  **commit re-verifies chunk existence (HEAD)** and re-uploads on a miss (GC race or out-of-band
  deletion). See `foundational-considerations.md` §7.
- Cross-volume move job: copy chunks bucket→bucket then `move` commit.

## Tasks

1. Implement + unit-test the fixed-size block chunker (deterministic boundaries; content-addressing; dedup hits).
2. Update download reassembler for multi-chunk files.
3. Refcount accounting on `addVersion`, `delete`, version expiry.
4. GC Workflow + Cron; safety checks (never delete a referenced chunk); dry-run mode.
5. Cross-volume copy job (Queue/Workflow), preferring R2 as cheap target.
6. Metrics in wide events: `chunks_total`, `chunks_missing`, `bytes_transferred`, dedup ratio.

## Acceptance criteria

- Appending to / overwriting the tail of a large file re-uploads only changed blocks; identical
  files/blocks dedup. (Full sub-file delta for mid-file inserts is the daemon's rsync path, deferred.)
- Two files sharing content upload the shared chunks once per volume.
- GC removes only unreferenced, expired chunks; a property test confirms no live chunk is deleted.
- A commit whose deduped chunk is missing (GC race or out-of-band deletion) re-uploads it (HEAD re-verify).
- Migrating an existing whole-file namespace to fixed-size blocks requires **no schema migration**
  (new versions simply use the new chunker).
