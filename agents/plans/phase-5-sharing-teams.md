# Phase 5 — Sharing & teams

**Goal:** collaboration — shared folders, public links, and team workspaces with seat-based
billing. Namespaces/ACL were designed in from Phase 2, so this activates them.

Design refs: `namespaces-and-acl.md`, `billing.md`, `auth.md`, `storage-byo-s3.md`.

## Scope (in)

- **Team namespaces:** create a team, a team namespace, invite members (Better Auth invites +
  `member` rows), roles (owner/admin/writer/reader).
- **Shared folders:** promote a folder to a **shared namespace** (own org + journal + home volume)
  and **mount** it into each member's root (the mount model — `namespaces-and-acl.md`,
  `foundational-considerations.md` §2); members get a role on the shared namespace, files inherit.
- **Public links:** a share record + on-demand presigned GET (or tokenized Worker route) with
  optional expiry/password. Read-only; bytes still come direct from the volume.
- **Seat-based billing** for teams (`seats` = member count) via the Stripe plugin reference system.
- Membership-aware sync: the DO fans out pokes only to members; ACL enforced on every op.

## Tasks

1. Team + invite flows; `member` management UI; role checks at edge + DO.
2. Shared-folder = shared namespace + a `mount` row; roles on the shared namespace; surface mounted
   namespaces in each user's root view.
3. Public-link issuance + redemption route; expiry/password; revocation.
4. Seat accounting → Stripe `seats`; `authorizeReference` owner gate; `beforeDelete` guard for
   teams with active subs.
5. WebSocket fan-out scoped to current members; permission changes propagate live.

## Acceptance criteria

- An owner can invite a writer who can edit; a reader cannot write; permission changes take effect
  live.
- A public link lets an anonymous visitor download a file directly from the bucket; revoking it
  stops access; expiry is honored.
- Team billing reflects seat count; only owners manage billing.
- A share never lets a user read outside the namespaces they're a member of (or a valid public-link
  scope) — incl. via AI/RAG (see `ai-rag.md`).
