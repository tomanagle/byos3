# Namespaces, membership & sharing

## Namespace = the unit of everything coordinated

A **namespace** is the unit of sync, the Durable Object, sharing, membership, and the billing
reference. It is owned by either:

- a **user** → a **personal** namespace (the default drive created at signup), or
- a **team** → a **team** namespace (shared workspace).

One DO instance per `namespace.id` serializes all its mutations (see `sync-engine.md`). This
abstraction is in the schema **from Phase 2** even though teams ship in Phase 5 - so we never
retrofit. A personal namespace is just a namespace with a single `owner` member.

## Volumes mount into namespaces

A namespace **mounts one or more volumes** (drives). Each file/folder node records its `volumeId`
(see `storage-byo-s3.md`). One namespace can therefore span an R2 volume and a B2 volume; the user
picks the target volume when creating top-level folders / dropping files. A `mountVolume` journal
op records a mount.

## Shared folders are namespaces (the mount model)

The hardest lesson from Dropbox (`foundational-considerations.md` §2): **cross-user sharing is a
shared namespace mounted into members' roots - not a role granted on a subtree of one user's tree.**

- A shared folder is its **own namespace** (= a Better Auth organization) with its own journal and
  membership. Identity is **(namespaceId, relative path)** + node GID; *path is a per-user
  projection*, never identity.
- A **mount table** maps namespaces into each user's root view; a namespace may be mounted at a
  different path by different members. A user's drive = their root namespace + mounted namespaces.
- **Permissions attach to the namespace; files inherit.** Moving a file *into* a shared namespace
  grants all members access (a security event); across namespaces it's a transactional
  delete-from-A + add-to-B.
- **Home volume (BYO twist):** each namespace has a **home volume** whose bucket holds its blobs.
  Collaborators read via presigned URLs brokered by the *home connector* - so the home account pays
  egress, and disconnecting/rotating/deleting that connector breaks shared access. A cross-namespace
  move between different home volumes is a **cross-bucket copy**.

Two distinct "mounts," don't conflate them: a **volume** is a storage drive mounted into a namespace
(where bytes live); a **namespace mount** is a shared namespace appearing in a user's root view (what
they see).

## Membership & roles

**A namespace is a Better Auth organization** (personal = a personal org with one `owner`; team = a
shared org). Membership, the four roles (`owner`/`admin`/`writer`/`reader`), invitations, the full
permission matrix, resource grants, and public links are all defined by RBAC - see
**[rbac.md](./rbac.md)**. Every namespace operation is authorized at the edge and re-checked in the
DO. Personal namespaces have exactly one `owner`.

## Billing reference

Because a namespace **is** an organization, the billing `referenceId` is always the
**organization id** (`customerType: "organization"`), with `seats` = member count for teams.
Billing actions require the `billing:manage` permission (owner) plus the Stripe plugin's
`authorizeReference`. See `billing.md` and `rbac.md`.

## Sharing (Phase 5)

- **Shared folders** - promoted to a **shared namespace** (own org + journal + home volume) and
  **mounted** into each member's root (the mount model above). Members get a role on the shared
  namespace; files inherit. (Subtree `grant`s are a finer *intra-namespace* scoping tool, not the
  cross-user sharing mechanism.)
- **Public links** - a share record + a presigned GET (or a tokenized Worker route that mints one
  on demand) with optional expiry/password. The link grants read to a node + its blocklist; bytes
  still come direct from the volume.
- **Team workspaces** - a team namespace with seat-based billing; invites flow through Better Auth
  + `member` rows.

See `plans/phase-5-sharing-teams.md`.

## Gotchas

- A team/namespace with an active subscription can't be hard-deleted automatically (Stripe plugin
  constraint) - handle in a `beforeDelete` check.
- Cross-namespace moves are copies (different DOs, possibly different volumes), not renames.
