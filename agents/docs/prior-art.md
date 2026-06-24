# Prior art & competitive landscape

Where byos3 sits among existing tools, what to borrow from each, and the gap we fill. Reference
context for design and positioning (not normative). Sources cited inline.

## The short answer

Lots of tools do *part* of what byos3 does — but **none combine all three of: (a) hosted,
multi-tenant, web-first SaaS; (b) the user brings their own S3-compatible bucket + credentials; and
(c) a genuine Dropbox-grade sync + sharing experience.** The market is cleanly split: the products
with a polished hosted experience *provide and sell you the storage*; the products that use *your*
storage are either self-hosted servers, client-side desktop mounts, power-user CLIs, or
backup/encryption overlays. That intersection is byos3's whitespace.

## The landscape

| Product | Category | BYO bucket? | Paradigm | Sync / dedup | E2E |
|---|---|---|---|---|---|
| **Nextcloud** | Self-hosted Dropbox | Operator-config primary; per-user only via 2nd-class *External Storage* app | Full suite | Whole-file (chunked upload), no dedup | Optional E2EE |
| **ownCloud Infinite Scale (oCIS)** | Self-hosted | Operator-config (decomposedfs `s3ng`) | Full suite | Whole-file (TUS), no dedup | At-rest |
| **Seafile** | Self-hosted | Operator-config (3 buckets) | Full suite | **Block-level CDC, Git-like CAS, true dedup** | Encrypted libraries (leaks names/sizes) |
| **Pydio Cells** | Self-hosted | Operator-config (flat UUID blobs) | Full suite | Whole-file | Server-side per-datasource |
| **Rclone** | Backend abstraction (CLI/lib) | Yes (local config) | mount / sync / bisync / serve | Checksum delta; `crypt`/`chunker` overlays | via `crypt` |
| **Filestash** | Web file manager | Yes (admin-config) | Browse only | None | via backend |
| **Mountain Duck / Cyberduck** | Desktop mount/transfer | Yes (local) | Mount-as-drive | Offline cache, no dedup | — |
| **ExpanDrive / CloudMounter** | Desktop mount | Yes (local) | Mount-as-drive | On-demand stream | CloudMounter client-side |
| **odrive** | BYO sync + control plane | Yes | Placeholder sync | Progressive sync, no dedup | Premium AES-256 |
| **MultCloud** | Hosted multi-cloud | Yes (mostly OAuth) | Cloud-to-cloud transfer | Scheduled transfer | — |
| **Kopia / Restic / Arq** | CAS backup to BYO bucket | Yes | Backup (snapshots) | **CDC + dedup + AEAD**, packed repos | Yes (per-repo key) |
| **Duplicati** | CAS backup | Yes | Backup | Fixed 100 KB blocks + dedup | Yes |
| **Syncthing** | P2P sync (no cloud) | N/A (peers) | Continuous bidirectional | **Fixed 128 KiB–16 MiB blocks**, version vectors | TLS transport |
| **Spacedrive** | Local-first VDFS | Cloud aspirations | Cross-device index | Whole-file (BLAKE3, sampled) | — |
| **Cryptomator** | E2E overlay on your cloud | Yes | Encrypt + virtual drive (no sync) | Relies on host's client | **Zero-knowledge** |
| **Tresorit / Sync.com / Proton Drive / MEGA** | Commercial privacy | **No — they sell storage** | Full suite | Provider-defined | **Zero-knowledge default** |
| **pCloud / Icedrive** | Commercial | **No — sell storage** | Full suite | pCloud block-level delta | E2E opt-in (folder) |

Sources: Nextcloud [primary](https://docs.nextcloud.com/server/stable/admin_manual/configuration_files/primary_storage.html)/[external](https://docs.nextcloud.com/server/stable/admin_manual/configuration_files/external_storage_configuration_gui.html) · [oCIS s3ng](https://doc.owncloud.com/ocis/next/admin/deployment/storage/s3.html) · [Seafile data model](https://manual.seafile.com/latest/develop/data_model/) · [Pydio datasources](https://docs.pydio.com/latest/admin-guide/connect-your-storage/datasources-overview/) · [rclone](https://rclone.org/) · [Filestash](https://www.filestash.app/) · [Mountain Duck](https://mountainduck.io/) · [ExpanDrive](https://www.expandrive.com/) · [odrive S3](https://odrive.com/s3) · [MultCloud](https://www.multcloud.com/) · [restic CDC](https://restic.net/blog/2015-09-12/restic-foundation1-cdc/) · [Kopia splitters](https://pkg.go.dev/github.com/kopia/kopia/repo/splitter) · [Arq format](https://www.arqbackup.com/documentation/arq7/English.lproj/dataFormat.html) · [Duplicati blocks](https://duplicatidocs.readthedocs.io/en/latest/appendix-a-how-the-backup-process-works/) · [Syncthing BEP](https://docs.syncthing.net/specs/bep-v1.html) · [Spacedrive](https://github.com/spacedriveapp/spacedrive) · [Cryptomator](https://docs.cryptomator.org/security/architecture/) · [Tresorit](https://tresorit.com/security) · [Sync.com](https://www.sync.com/blog/zero-knowledge/) · [Proton Drive](https://proton.me/drive/security) · [pCloud](https://www.pcloud.com/features/encryption.html)

## Closest comparables, and how byos3 differs

- **Filestash** — nearest *web BYO* analog, but self-host-only, admin-provisions backends, and is
  **browse-only (no sync engine, no dedup)**. byos3 is hosted multi-tenant with a real sync engine.
- **odrive** — has the BYO-storage + control-plane + placeholder-sync combo, but is
  **desktop-sync-centric, not web-first**, and has no dedup/delta or first-class sharing.
- **Nextcloud External Storage** — the only mainstream *per-user* BYO-bucket path, but it's a
  degraded second-class mount on a server the user (or an operator) must run.
- **Cryptomator** — the BYO-cloud leader for *encryption*, but explicitly **does not sync** (it
  offloads that to the underlying cloud's client) and has only coarse vault-level sharing.

None is a turnkey, hosted, web-first, multi-tenant, BYO-S3 Dropbox. **We charge for the service
(sync, coordination, sharing, features), not for gigabytes** — the opposite of every provider that
sells storage.

## What byos3 borrows (mapped to our design)

- **oCIS `decomposedfs`** is the cleanest reference for our exact split: metadata/tree/ACLs in a
  control plane, blob *contents* as flat objects in the bucket. Validates `architecture.md`.
- **Rclone's backend abstraction** (`fs.Fs` across 70+ providers) is conceptually our
  **`StorageDriver` port** (`code-architecture.md`) — proof the multi-provider port model scales.
- **Seafile's content-addressed object graph** (commits→fs→blocks, hash-named, immutable) validates
  our blocklist/CAS model — but learn from its weaknesses: it needs **3 buckets** (we use one bucket
  + prefixes) and **leaks filenames/sizes** even in "encrypted" libraries (our future E2E must hide
  metadata).
- **Syncthing's conflict model** (per-file version vectors + keep-both `.sync-conflict` files)
  validates our **LWW + conflicted-copy** choice (`sync-engine.md`).
- **Restic/Kopia**: use a **per-repo AEAD key (AES-256-GCM / ChaCha20-Poly1305), never naive
  convergent encryption**, and a **per-repo random chunking parameter** so boundaries don't leak
  fingerprints — guidance for `crypto` if/when we chunk under E2E.
- **Spacedrive**: **BLAKE3** is much faster than SHA-256 for large-file hashing. We keep **SHA-256**
  as the content id (S3 `x-amz-checksum-sha256` compatibility, `storage-byo-s3.md`), but BLAKE3 is
  the fallback if client-side hashing becomes a bottleneck.
- **Cryptomator** is the blueprint for our **E2E crypto seam** (below).

## CDC vs fixed blocks — reconciling the prior art with our decision

Research on backup tools (Restic, Kopia, Arq, Perkeep) **recommends content-defined chunking (CDC)**
and calls fixed blocks an anti-pattern. This *looks* like it contradicts our decision in
`foundational-considerations.md` §3 to use **fixed blocks**. It doesn't — the right answer depends
on two things those tools have that we don't:

1. **They pack chunks into large repository objects** (Restic packs; Kopia ~20–40 MB pack blobs;
   Duplicati 50 MB dblocks). Packing makes tiny CDC chunks economical. **We store each chunk as its
   own object in the user's bucket** (presigned direct upload, content-addressed) and **can't pack
   server-side** without proxying bytes — so per-object cost and minimum-billable-size push us toward
   **fewer, larger blocks**, not many small CDC chunks.
2. **They dedup globally across snapshots of the same data.** CDC's shift-resilience pays off when
   you re-back-up an edited file repeatedly. **Our dedup is per-volume** (per user's bucket), so that
   payoff is far smaller.

Tellingly, the closest-paradigm tools — **Dropbox and Syncthing, both *sync* engines — use fixed
blocks**, not CDC. So: **fixed blocks remain the right call (Phase 3).** We get shift-resilience
later the way Dropbox does — **rsync/`fast_rsync` byte-delta in the desktop daemon** (which has the
old version locally) — not via CDC. **Revisit CDC only if we add client-side packing** (which would
let CDC pay off); that's a documented, deferred alternative, not an oversight.

## E2E blueprint for the `crypto` seam (later)

When we add optional end-to-end encryption, copy Cryptomator's proven design rather than invent
crypto ([architecture](https://docs.cryptomator.org/security/architecture/)):

- **Per-file content keys** wrapped by a per-namespace masterkey; content **AES-256-GCM** in **fixed
  chunks** (so block-level delta sync survives encryption — bake chunked encryption into the seam now
  even though the MVP ships plaintext-to-server).
- **Deterministic filename encryption via AES-SIV** with the parent directory id as associated data
  — this is what keeps an encrypted tree navigable on opaque object storage.
- **scrypt/Argon2 KEK + AES-KW masterkey wrapping** so passphrase changes don't re-encrypt data.
- **Public-key (RSA/ECC) per-recipient key wrapping for sharing** (à la Tresorit) — beats
  Cryptomator's weak vault+passphrase sharing, which is its main gap.
- Accept the tradeoffs up front: **E2E forecloses server-side previews, search, and dedup**, and
  **public links require either key-in-URL-fragment (MEGA-style) or a key-escrow tier**. Decide per
  feature which tier is E2E vs server-readable.

Note: **Boxcryptor** (the other BYO-cloud encryption product) was acquired by Dropbox in 2022 and
fully discontinued **Dec 31 2025** ([Dropbox](https://blog.dropbox.com/topics/company/dropbox-to-acquire-boxcryptor-assets-bring-end-to-end-encryption-to-business-users)),
leaving Cryptomator largely alone in BYO-cloud encryption — a gap byos3 could address with a
first-class optional-E2E tier.

## Positioning

Lead with what only byos3 offers together: **you own the bucket and the bytes** (data sovereignty,
no per-GB storage rent — we charge for the service), plus a **real Dropbox-grade sync/sharing
experience** that the encryption overlays punt on and the desktop mounts don't have, delivered as a
**hosted web app** so users don't run a server (unlike Filestash/Nextcloud). The honest MVP framing
is **"server-readable, not E2E"** — the same default as Dropbox/pCloud/Icedrive — with a credible
path to optional E2E via the seam above.
