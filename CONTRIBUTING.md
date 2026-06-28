# Contributing to byos3

Thanks for your interest! byos3 is a bring-your-own-S3 file storage + sync app on Cloudflare Workers.
This guide gets you from clone to a mergeable PR.

## Ground rules

- **Read [`AGENTS.md`](./AGENTS.md) first** - it's the canonical guide to the architecture, the golden
  rules, and which doc in [`agents/docs/`](./agents/docs/) covers which area.
- **Docs are normative.** When you change behavior, update its doc in `agents/docs/` in the same PR.
  Code-vs-doc disagreement is treated as a bug.
- **The one rule people forget:** bytes never pass through the Worker. Clients transfer files directly
  to the user's bucket via presigned URLs. If you find yourself streaming file content through a
  Worker, stop and re-read [`agents/docs/storage-byo-s3.md`](./agents/docs/storage-byo-s3.md).
- **Never log secrets** - credentials, presigned URLs, session/API tokens. See `agents/docs/logging.md`.
- Security issues: **do not open a public issue** - see [`SECURITY.md`](./SECURITY.md).

## Setup

Requires [Bun](https://bun.sh). Tooling runs on Bun; the app deploys to Cloudflare Workers (workerd),
so dev servers run via Wrangler / Vite (not the Bun runtime).

```bash
bun install                                       # also installs git hooks (lefthook)
bun run secrets:setup                             # generate local .dev.vars (gitignored)
bun run --filter='@byos3/web' db:migrate:local    # apply D1 migrations to the local DB
bun run dev                                        # web app at http://localhost:3000
```

Or run web + api + docs in containers (shared local D1, auto-migrations, HMR):

```bash
bun run docker:up      # web → :4500 · api → :8788 · docs → :8789
```

See [`dev/README.md`](./dev/README.md) for the container stack.

## Workflow

1. **Fork** and create a branch off `main` (`main` is protected - changes land via PR).
2. Make your change. Keep PRs focused; update the relevant `agents/docs/*.md` alongside code.
3. **Run the checks locally** (these are exactly what CI enforces):
   ```bash
   bun run lint          # oxlint  (bun run lint:fix to autofix)
   bun run format        # oxfmt   (writes; bun run format:check to verify)
   bun run build         # builds the web Worker
   bun run skills:validate && bun run skills:stale   # Agent Skills frontmatter + freshness
   ```
   `lefthook` runs oxfmt + oxlint on pre-commit and a full lint on pre-push, so most of this is
   automatic.
4. **Tests:** run the relevant workspace's tests (`bun test` for `packages/*` and the API; `vitest`
   for the web app), and `bun run e2e` for the Playwright + MinIO end-to-end suite when your change
   touches the transfer/sync path.
5. **Open a PR into `main`.** CI must pass and a maintainer ([`CODEOWNERS`](./.github/CODEOWNERS))
   will review. If your change touches a doc that an Agent Skill references, regenerate/bump the skill
   so the `stale` check passes (see [`agents/docs/agent-skills.md`](./agents/docs/agent-skills.md)).

## Conventions

- Match the surrounding code: house style lives in `agents/docs/conventions.md` and
  `code-architecture.md`. Write code that reads like its neighbors.
- One core, two transports: business logic lives in `packages/services`; the web (server functions)
  and api (Hono routes) are thin wrappers. Don't duplicate logic into a transport.
- TypeScript throughout; let `oxlint`/`oxfmt` settle style debates.

## Releases

Releases are **maintainer-only** and tag-driven - contributors don't cut tags. A maintainer bumps the
version via PR (`bun run release`) and tags it (`bun run release:tag`), which deploys. See
[`agents/docs/deployment.md`](./agents/docs/deployment.md).

## Licensing

By contributing, you agree that your contributions are licensed under the project's
[MIT License](./LICENSE).
