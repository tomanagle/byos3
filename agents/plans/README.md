# agents/plans - byos3 roadmap

Phased build plan. Each phase has its own file with goals, scope, concrete tasks, and acceptance
criteria. Implement in order; design details live in [`agents/docs/`](../docs/).

Keep the **status** column current as work lands.

## Phases

| Phase | File | Goal | Status |
|---|---|---|---|
| 0 | [phase-0-landing-waitlist.md](./phase-0-landing-waitlist.md) | Public landing page + email waitlist in D1; proves the TanStack Start → Workers → D1 → deploy pipeline | **In progress** · built & verified locally (CI/CD + Pulumi wired; needs real CF account to deploy) |
| 1 | [phase-1-foundation.md](./phase-1-foundation.md) | Prove BYO + direct-transfer: auth, connect-a-bucket, presigned upload/download, whole-file storage, flat list | Not started |
| 2 | [phase-2-drive-and-sync.md](./phase-2-drive-and-sync.md) | A real drive: folder tree, DO journal, versioning, cursor sync, WebSocket notifications | Not started |
| 2.5 | [billing-subscriptions.md](./billing-subscriptions.md) | Paid plans gate usage (Better Auth Stripe), entitlements enforced | Not started |
| 3 | [phase-3-chunking-dedup.md](./phase-3-chunking-dedup.md) | Fixed-size blocks, dedup & safe GC (NOT CDC - see foundational-considerations.md) | Not started |
| 4 | [phase-4-desktop-daemon.md](./phase-4-desktop-daemon.md) | Native filesystem sync client (three-tree engine), selective sync | Not started |
| 5 | [phase-5-sharing-teams.md](./phase-5-sharing-teams.md) | Public links, shared folders (namespace+mount), team workspaces | Not started |
| - | [ai-rag.md](./ai-rag.md) | RAG across documents (Workers AI + Vectorize), plan-gated | Deferred |

## Sequencing notes

- **Phase 0** is deliberately tiny: it stands up the monorepo, the TanStack Start Worker, D1,
  secrets, and deploy with a low-risk deliverable (a waitlist), so the whole pipeline is proven before
  product work begins.
- Phase 1 ships the *dumbest* storage (whole-file) but the *real* data model (files as blocklists) so
  Phase 3 is a chunker swap, not a migration. See `agents/docs/sync-engine.md`.
- Namespaces and ACL are **designed into the schema from Phase 2** even though teams ship in Phase 5 -
  see `agents/docs/namespaces-and-acl.md` (cross-user sharing uses the namespace+mount model).
- Billing (2.5) can land any time after auth + namespaces exist; do it before any public launch.
