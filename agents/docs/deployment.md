# Deployment, CI & tooling

How byos3 is linted, formatted, built, and shipped. Everything deploys from a GitHub Action;
**Pulumi** owns the stateful Cloudflare resources and **Wrangler** ships the Worker artifact.

## The split: Pulumi vs Wrangler

- **Pulumi (`infra/`)** provisions *stateful* Cloudflare resources — the **D1 database** and the
  **Turnstile widget** — and exports their IDs. Stable, declarative, reviewable.
- **Wrangler** builds + ships the **Worker** itself (TanStack Start via `@cloudflare/vite-plugin`),
  using the IDs Pulumi exported.

This split avoids trying to push a Vite-bundled Worker through raw IaC while still keeping all infra
declarative. `infra/` is a standalone Pulumi TS program (not a Bun workspace member); it installs
its own deps in CI.

## Domains & DNS

- **Web app → the apex `byos3.com`.** **Public API → `api.byos3.com`.** There is intentionally **no
  `app.byos3.com`**.
- Each Worker attaches to its hostname via a **Wrangler `custom_domain` route** in its
  `wrangler.jsonc` (`{ "pattern": "byos3.com", "custom_domain": true }` /
  `"api.byos3.com"`). On `wrangler deploy`, Cloudflare provisions the proxied **DNS record + edge
  TLS** automatically.
- **DNS ownership:** the worker hostnames are Workers-managed custom domains, so **Pulumi does NOT
  create those DNS records** (it would conflict/drift). Pulumi owns the zone-scoped/stateful
  resources (D1, Turnstile) and assumes the `byos3.com` **zone already exists** in the account.
  `appDomain`/`apiDomain` are Pulumi config (defaults `byos3.com` / `api.byos3.com`).

## Linting & formatting (oxc)

- **oxlint** (`.oxlintrc.json`) — fast Rust linter. `bun run lint` / `bun run lint:fix`.
  `react/react-in-jsx-scope` is off (automatic JSX runtime); generated files are ignored.
- **oxfmt** (`.oxfmtrc.json`) — fast Rust formatter. `bun run format` (write) / `bun run format:check`.
  Honors `.gitignore` + `.prettierignore` (generated files excluded).
- **lefthook** (`lefthook.yml`) — git hooks, installed by `bun run prepare` (runs on `bun install`):
  - **pre-commit:** oxfmt (write + restage) and oxlint on staged files.
  - **pre-push:** full `oxlint`.

## GitHub Actions

- **`.github/workflows/ci.yml`** (PRs + pushes): `bun install` → `oxlint` → `oxfmt --check` →
  `bun run build`. The gate for merges.
- **`.github/workflows/deploy.yml`** (push to `main` / manual): the production pipeline —
  1. `pulumi up` (provision D1 + Turnstile).
  2. Read stack outputs (`d1DatabaseId`, `turnstileSiteKey`, `turnstileSecretKey`).
  3. Inject the real D1 id + site key into `workspaces/apps/web/wrangler.jsonc` (and the D1 id into
     `workspaces/apps/api/wrangler.jsonc`).
  4. `bun run build` → `wrangler d1 migrations apply DB --remote` →
     `wrangler secret put TURNSTILE_SECRET_KEY` → **`wrangler deploy` (web → byos3.com)** →
     **`wrangler deploy` (api → api.byos3.com)**.

  Non-Turnstile secrets (`CREDENTIAL_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, Stripe) are SOPS-managed
  and pushed to **both** Workers out-of-band via `bun run secrets:deploy` (see `secrets.md`).

## Required GitHub config

- **Secrets:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PULUMI_ACCESS_TOKEN`.
- **Variables:** `PULUMI_STACK` (e.g. `your-org/byos3/production`).
- One-time: `wrangler d1 create byos3` to get a real `database_id` (the committed config uses a
  `local-dev-placeholder`, fine for local dev; the deploy workflow injects the real id from Pulumi).
- Confirm `@pulumi/cloudflare` resource attribute names against the installed provider version
  before the first `pulumi up`.

## Local commands

```bash
bun install                                   # also installs git hooks (prepare → lefthook)
bun run --filter='@byos3/web' db:migrate:local  # apply D1 migrations to the local DB
bun run dev                                   # vite dev (port 3000; auto-bumps if taken)
bun run lint && bun run format:check && bun run build
```

Secrets are SOPS-managed (`secrets.md`); local Turnstile uses Cloudflare's public **test** keys
(always pass) so dev works with no setup.
