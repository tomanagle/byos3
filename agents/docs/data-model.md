# Data model

Two stores: **D1** (global, relational, cross-account) and **per-namespace Durable Object SQLite**
(the authoritative journal + tree). Rule of thumb: *D1 = global relational tables; DO-SQLite =
per-namespace authoritative state.*

## D1 (global)

Better Auth owns `user`, `session`, `account`, `verification` (see `auth.md`), and - via the
**organization plugin** - `organization`, `member`, `invitation` (see `rbac.md`). The **admin
plugin** adds `user.role` (platform role); the **`apiKey` plugin** owns `apikey` (see `api.md`). The
Stripe plugin owns `subscription` and adds `stripeCustomerId` (see `billing.md`). Our own tables:
`connector`, `volume`, `grant`, `shareLink`, `mount`.

### `organization` = namespace (Better Auth org plugin, extended)
The sync/sharing/billing/DO unit **is** a Better Auth organization; **`NamespaceId` = the
organization id**. Extended via `additionalFields` with `type` (`personal` | `team`), `defaultVolumeId`, and
`homeVolumeId` (the volume whose bucket holds this namespace's blobs - see
`foundational-considerations.md` §2). Billing `referenceId` = the organization id. One Durable Object instance per
organization id. (Personal namespace = a personal org with a single `owner` member.)

### `member` (Better Auth org plugin)
`(organizationId, userId, role)` - `role` is one or more of `owner`/`admin`/`writer`/`reader`
(comma-separated). Canonical membership store; the DO caches a projection for inline authz. See
`rbac.md`.

### `grant` & `shareLink` (resource-scoped access - ours)
`grant`: `id`, `organizationId`, `subtreeNodeGid`, `principalType` (`user`|`email`), `principalId`,
`role`, `createdBy`, `createdAt` - a role on a subtree (shared folders). `shareLink`: `id`,
`organizationId`, `subtreeNodeGid`, `tokenHash`, `role`, `expiresAt`, `passwordHash?`, `createdBy`,
`revokedAt` - anonymous read of a subtree. See `rbac.md`.

### `mount` (namespace mount table - ours)
`id`, `rootNamespaceId` (the viewer's root org), `mountedNamespaceId` (the shared namespace), `path`
(where it appears in the viewer's tree), `createdAt`. Maps shared namespaces into users' root views
(mountable at different paths per member). The cross-user sharing primitive - see
`namespaces-and-acl.md` and `foundational-considerations.md` §2.

### `apikey` (Better Auth `apiKey` plugin - the separate `@better-auth/api-key` package in BA ≥1.6)
`id`, hashed `key`, non-secret `prefix`/`start`, `name`, **`referenceId`** (the owning user - the
plugin generalized `userId` → `referenceId`), `configId`, `enabled`, `expiresAt`,
`remaining`/`refillAmount`/`refillInterval`, `rateLimit*`, **`permissions`** (scopes - same
`resource:[actions]` vocab as RBAC), `metadata` (e.g. namespace restriction), timestamps.
Programmatic auth; effective permission = key scopes ∩ the owner's role. Scoped-key creation is a
**server-only** operation (`auth.api.createApiKey` with an explicit `userId`, no forwarded headers);
the API Worker verifies an `x-api-key` with `auth.api.verifyApiKey`. See `api.md`, `auth.md`.

### `waitlist` (Phase 0 - pre-launch)
`id`, `email` (normalized lowercase, **unique**), `name` (optional), `referrer`/`source` (optional),
`createdAt`. The only table **not** tied to a user/namespace; captures landing-page interest before
the product exists. See `plans/phase-0-landing-waitlist.md`.

### `connector`
An encrypted provider credential. `ownerUserId` is a **FK to `user`** (`onDelete: cascade`). A user
may have many; the owner is seeded as a `full` member (below).

### `connector_member` / `volume_member` (resource-level sharing - ours)
`(id, connectorId|volumeId, userId, role, createdAt)`, unique on `(resourceId, userId)`, FKs to the
resource + `user` (cascade). `role` ∈ `full | read_write | read_only`. **Access to a connector/volume
is governed by these rows, not namespace membership** (`rbac.md` - Resource-level sharing). The owner
is a `full` member; sharing adds rows.
`id (conn_…)`, `ownerUserId`, `provider` (MVP/Tier-1: `s3` | `r2` | `b2`; `s3` = any SigV4-family
provider - the full set & per-provider behavior is **data** in `storage-providers.md`), `endpoint`,
`region` (`auto` for R2), `accessKeyId`, `secretCipher` (envelope-encrypted by `packages/crypto`
under `CREDENTIAL_ENCRYPTION_KEY` - see `secrets.md`),
`label`, `status` (`active` | `invalid` | `revoked`), `lastVerifiedAt`, `createdAt`.

### `volume`
A **mountable drive** = connector + bucket + prefix, mounted into a namespace.
`id (vol_…)`, `connectorId`, `namespaceId`, `bucket`, `prefix`, `label`, `icon`, `status`,
`createdAt`. (The namespace's default drop target is `organization.defaultVolumeId` - a single
pointer, not a per-row flag.)
A namespace can mount several volumes; each node lives in exactly one. See `storage-byo-s3.md`.

### `user_preferences` (per-user UI prefs - ours)
One row per user (`user_id` PK → `user(id)` ON DELETE CASCADE): `file_view` (`grid` | `list` |
`tree`, default `list`), `grid_size` (`small` | `large`, default `large`), `updated_at`. The web app
caches this in localStorage for instant first paint and treats the server row as the cross-device
source of truth (web `getPreferences`/`savePreferences` server fns; `useFileView()` hook). See
`web-app.md`.

## Durable Object SQLite (per namespace)

### `journal` - append-only, the source of truth
`seq INTEGER PRIMARY KEY AUTOINCREMENT`, `op` (JSON, validated against the journal-op Zod union),
`actorDeviceId`, `ts`. **`seq` is the logical clock.** Never delete or rewrite rows. A periodic
**snapshot** of the materialized tree + **compaction** (drop rows below the minimum live cursor)
keeps it within the 10 GB DO limit; cold start loads the snapshot then the tail, never `seq 0`. See
`foundational-considerations.md` §4.

### `node` - current tree (derived from the journal, kept materialized)
`gid (node_…) PRIMARY KEY` - **stable across rename/move** so moves are O(1) metadata ops,
`parentGid`, `name`, `type` (`file` | `folder`), `volumeId`, `currentVersionId`,
`deleted`, `aiEnabled` (default false; folders), `updatedSeq`.

### `version` - version history per node
`id`, `nodeGid`, `blocklist` (JSON: ordered `[{hash, size}]`), `size`, `sha256` (whole-file),
`createdSeq`, `authorDeviceId`. New content = new version; old versions retained per plan's
history limit (`billing.md`).

### `chunk_index` - per-volume "do we have this chunk?" + GC refcount
`volumeId`, `hash`, `size`, `refcount`. PRIMARY KEY `(volumeId, hash)`. Drives the missing-chunk
check at commit and mark-sweep GC. **Keyed by volume** because content addressing is per-bucket.

### `device`
`id (dev_…)`, `userId`, `name`, `lastCursor`, `lastSeenAt`. Connected-device count is an
entitlement (`billing.md`).

### `entitlement` (cache)
Plan limits (devices, seats, history days, volume count, AI quota) cached from D1, refreshed on
subscription webhook or TTL. The DO enforces limits inline using this.

### `member` + `grant` (authz projections, cache)
Per-namespace membership (`userId → role`) and resource grants, projected from D1 / journal ops and
refreshed on change + by TTL. The DO re-checks every mutation with the shared `authorize()` using
these. Canonical store is Better Auth's `member` table + our `grant` table. See `rbac.md`.

## Identifiers & cursor

- IDs are prefixed + branded (`node_`, `vol_`, `conn_`, `dev_`). The **namespace id is the Better
  Auth `organization` id** (not separately prefixed); there is no `team_` id. Generate ours with
  a collision-resistant scheme (e.g. ULID-like) - note `Math.random`/`Date.now` are unavailable in
  some Worker contexts, so use `crypto.randomUUID()` / `crypto.getRandomValues`.
- **Sync cursor** = the last `journal.seq` a client has applied, encoded opaquely as
  `{namespaceId, seq}`. Clients send it to pull deltas; the DO returns ops with `seq > cursor`.

All shapes above have a corresponding Zod schema in `packages/protocol`.
