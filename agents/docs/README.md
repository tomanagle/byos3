# agents/docs — byos3 documentation

This directory documents **how every part of the application works** and **how code should be
written**. It is the normative source of truth: when behavior changes, the relevant doc is
updated in the same change. Agents should read the relevant doc before implementing or reviewing.

See [`AGENTS.md`](../../AGENTS.md) for the golden rules and the task→doc map.

## Index

- **[architecture.md](./architecture.md)** — the big picture: control plane vs data plane, the
  metadata/blob split, request flows, the Cloudflare primitive map. *Start here.*
- **[foundational-considerations.md](./foundational-considerations.md)** — lessons from how Dropbox
  evolved (and what they got wrong early), the load-bearing decisions, and BYO-specific risks behind
  the sync/sharing/storage design. *Read before changing foundational design.*
- **[prior-art.md](./prior-art.md)** — competitive landscape (Nextcloud, Seafile, rclone, Filestash,
  odrive, Kopia/Restic, Cryptomator, Tresorit, …), the gap byos3 fills, what to borrow from each, and
  positioning.
- **[conventions.md](./conventions.md)** — how to write code in this repo: language rules,
  schema-first contracts, error handling, security, testing. *Read before coding.*
- **[code-architecture.md](./code-architecture.md)** — how the code is structured: ports &
  adapters, domain entities (`Volume`/`Connector`) as facades, the composition root, and the
  capability-scoped credential pattern. *Read before writing a package or service.*
- **[monorepo.md](./monorepo.md)** — workspace layout, Bun-vs-Wrangler split, packages, builds,
  testing, environments & secrets.
- **[data-model.md](./data-model.md)** — D1 tables, Durable Object storage layout, the journal,
  and how identifiers work.
- **[sync-engine.md](./sync-engine.md)** — blocklists, the append-only journal, cursor sync, the
  two-phase commit protocol, change notification, conflict resolution.
- **[storage-byo-s3.md](./storage-byo-s3.md)** — connecting a bucket, credential handling,
  presigned URLs, multipart, provider quirks (S3/R2/B2), CORS, garbage collection.
- **[storage-providers.md](./storage-providers.md)** — per-provider credential creation, exact
  least-privilege permissions/policies, endpoints, CORS support, gotchas, and doc links for all
  supported S3-compatible providers, plus the provider capability-flag model.
- **[s3-compatibility.md](./s3-compatibility.md)** — what "S3-compatible" actually means (the wire
  protocol), the exact S3 subset byos3 requires, and how we test our client (local MinIO) and
  certify providers (ceph/s3-tests).
- **[auth.md](./auth.md)** — Better Auth on Workers, sessions, account model.
- **[billing.md](./billing.md)** — subscriptions via the Better Auth Stripe plugin, plans,
  entitlements, enforcement, the BYO pricing model.
- **[namespaces-and-acl.md](./namespaces-and-acl.md)** — personal vs team namespaces, membership,
  roles, sharing, how it ties to billing reference IDs.
- **[rbac.md](./rbac.md)** — role-based access control: platform/namespace/resource scopes, roles &
  permission matrix, resource grants & public links, and how it's implemented with Better Auth's
  organization + admin plugins and enforced at the edge and in the DO.
- **[api.md](./api.md)** — API-first design: the versioned `/api/v1` surface, session vs API-key
  authentication, API key management & scopes (∩ RBAC), OpenAPI, and web/API parity.
- **[web-app.md](./web-app.md)** — TanStack Start structure, shadcn/ui, server functions vs HTTP
  routes, client-side hashing/upload.
- **[routing.md](./routing.md)** — the path-based route table, session resolution at the root, the
  `SHOW_WAITING_SCREEN` waitlist gate, the persistent `_app` shell layout, and deep-linkable search.
- **[ai-rag.md](./ai-rag.md)** — (later) RAG across docs with Workers AI + Vectorize; the
  indexer seam and its one sanctioned exception to the no-bytes rule.
- **[logging.md](./logging.md)** — wide events / canonical log lines: one structured event per
  request per hop, the `@byos3/logging` package, fields, sampling, Cloudflare delivery.
- **[secrets.md](./secrets.md)** — platform secret management with SOPS + age (local/prod), the
  setup/deploy scripts, and the platform-secrets-vs-end-user-bucket-credentials distinction.
- **[deployment.md](./deployment.md)** — CI/CD: Pulumi IaC + GitHub Actions (lint/build + deploy),
  oxlint/oxfmt/lefthook tooling, and the Pulumi-vs-Wrangler split.

## How to write a doc here

Each doc explains, in this order: **how the feature works → key decisions & why → gotchas →
where the code lives**. Keep it dense and current. Cross-link related docs.
