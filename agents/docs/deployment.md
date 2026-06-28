# Deployment, CI & tooling

How byos3 is linted, formatted, built, and shipped. Everything deploys from a GitHub Action;
**Pulumi** owns the stateful Cloudflare resources and **Wrangler** ships the Worker artifact.

## The split: Pulumi vs Wrangler

- **Pulumi (`infra/`)** provisions *stateful* Cloudflare resources - the **D1 database** and the
  **Turnstile widget** - and exports their IDs. Stable, declarative, reviewable.
- **Wrangler** builds + ships the **Worker** itself (TanStack Start via `@cloudflare/vite-plugin`),
  using the IDs Pulumi exported.

This split avoids trying to push a Vite-bundled Worker through raw IaC while still keeping all infra
declarative. `infra/` is a standalone Pulumi TS program (not a Bun workspace member); it installs
its own deps in CI.

## Domains & DNS

- **Web app → the apex `byos3.com`.** **Public API → `api.byos3.com`.** **API docs → `docs.byos3.com`.**
  There is intentionally **no `app.byos3.com`**.
- Each Worker attaches to its hostname via a **Wrangler `custom_domain` route** in its config:
  web `wrangler.jsonc` (`{ "pattern": "byos3.com", "custom_domain": true }`), api `wrangler.jsonc`
  (`"api.byos3.com"`), and the docs static-assets Worker `wrangler.docs.jsonc` (`"docs.byos3.com"`).
  On `wrangler deploy`, Cloudflare provisions the proxied **DNS record + edge TLS** automatically.
- **DNS ownership:** the worker hostnames are Workers-managed custom domains, so **Pulumi does NOT
  create those DNS records** (it would conflict/drift). Pulumi owns the zone-scoped/stateful
  resources (D1, Turnstile) and assumes the domain's **zone already exists** in the account.
- **Forkable via one variable.** The domain is the **`APP_DOMAIN`** GitHub Actions variable (default
  `byos3.com`). The deploy workflow passes it to Pulumi (Turnstile domains) AND rewrites all three
  `wrangler` configs - including the `custom_domain` route patterns - so the app serves at
  `APP_DOMAIN`, the API at `api.APP_DOMAIN`, and the docs at `docs.APP_DOMAIN`. The web Worker also
  gets `APP_DOMAIN` as a var binding, which drives Better Auth's `baseURL` + trusted origins. No code
  edits to deploy your own copy.

## Linting & formatting (oxc)

- **oxlint** (`.oxlintrc.json`) - fast Rust linter. `bun run lint` / `bun run lint:fix`.
  `react/react-in-jsx-scope` is off (automatic JSX runtime); generated files are ignored.
- **oxfmt** (`.oxfmtrc.json`) - fast Rust formatter. `bun run format` (write) / `bun run format:check`.
  Honors `.gitignore` + `.prettierignore` (generated files excluded).
- **lefthook** (`lefthook.yml`) - git hooks, installed by `bun run prepare` (runs on `bun install`):
  - **pre-commit:** oxfmt (write + restage) and oxlint on staged files.
  - **pre-push:** full `oxlint`.

## GitHub Actions

- **`.github/workflows/ci.yml`** (PRs + pushes): `bun install` → `oxlint` → `oxfmt --check` →
  `bun run build`. The gate for merges.
- **`.github/workflows/deploy.yml`** (**version tag** `v*` / manual dispatch): the production pipeline.
  Deploys are driven by tags - `bun run release [patch|minor|major]` bumps the **root package.json**
  version, commits it, and pushes `v<version>` - not by branch pushes, so every release is deliberate
  and labelled. The run summary records the version + URLs. Each run is incremental: Pulumi (state in
  R2) + the D1 migration ledger know the current deployed state, so re-running only applies the delta.
  The steps:
  1. Ensure the R2 **state bucket** exists (`wrangler r2 bucket create`, idempotent), then `pulumi up`
     (provision D1 + Turnstile for `APP_DOMAIN`, plus - when `STRIPE_SECRET_KEY` is set, passed to
     Pulumi as `STRIPE_API_KEY` - the live Stripe product/prices/webhook). Pulumi state lives in R2.
  2. Read stack outputs (`d1DatabaseId`, `turnstileSiteKey`, `turnstileSecretKey`, and - when billing
     is on - `stripePriceMonthlyId`, `stripePriceAnnualId`, `stripeWebhookSecret`).
  3. Inject the real D1 id and `APP_DOMAIN` into the three wrangler configs (the domain rewrite updates
     the `custom_domain` route patterns → `APP_DOMAIN` / `api.APP_DOMAIN` / `docs.APP_DOMAIN`).
  4. `bun run build` (with `VITE_TURNSTILE_SITE_KEY` = the Pulumi site key, inlined into the client
     bundle) → `wrangler d1 migrations apply DB --remote` → **`wrangler deploy`** web + api, then
     `bun run docs:build` → **`wrangler deploy --config wrangler.docs.jsonc`** (the docs site, built
     from the API's own OpenAPI spec; version comes from the root package.json).
  5. Set Worker secrets on **both** app Workers: `TURNSTILE_SECRET_KEY` (from the Pulumi output) +
     `BETTER_AUTH_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` (from GitHub secrets). When `STRIPE_SECRET_KEY`
     is set, the **web** Worker also gets `STRIPE_SECRET_KEY` + the Pulumi-provisioned `STRIPE_PRICE_MONTHLY`
     / `STRIPE_PRICE_ANNUAL` / `STRIPE_WEBHOOK_SECRET` (billing.md); unset = billing stays off. Likewise,
     when both `AUTH_GITHUB_CLIENT_ID` + `AUTH_GITHUB_CLIENT_SECRET` are set they go on the **web** Worker
     to enable "Continue with GitHub" (auth.md). The docs Worker is static assets only - no secrets.

  CI sets the Worker secrets directly from GitHub secrets (via `wrangler secret put`), so a fork
  needs no encrypted-secrets tooling - just set the GitHub secrets/variables below (see `secrets.md`).

## Releasing & versioning

The **root `package.json` `version`** is the single source of truth (the docs site imports it via
`scripts/build-docs.ts`, so the published reference always shows what's live). Releasing is **two
steps** so it works with a protected `main` (PR-required) without admin bypass:

1. `bun run release [patch|minor|major]` (`dev/release.ts`, default `patch`) runs the gate
   (lint/format/build), bumps the version on a **`release/v<next>` branch**, pushes it, and opens a
   PR. Nothing is pushed to `main`. (`--dry-run` previews; `--skip-checks` skips the local gate - the
   PR's CI still gates the merge.)
2. Review + **merge the PR** (CI must pass).
3. The tag is created `v<version>`, which triggers `deploy.yml`:
   - **Automatically** if `RELEASE_PAT` is configured: `auto-tag.yml` runs on the merge to `main`,
     sees the new version, and pushes the tag. Merging the PR is the whole release.
   - **Manually** otherwise: `git switch main && git pull`, then `bun run release:tag` - on an
     up-to-date `main` it pushes only the tag (a tag push isn't a branch push, so branch protection
     doesn't block it).

`v*` tag creation is restricted to maintainers by a tag ruleset. The auto-tag job needs a **PAT**
(`RELEASE_PAT`, a fine-grained token with Contents: read+write) for two reasons: a tag pushed with
the default `GITHUB_TOKEN` would NOT trigger `deploy.yml` (GitHub's no-recursion rule), and the PAT's
maintainer identity satisfies the tag ruleset. Without `RELEASE_PAT`, `auto-tag.yml` no-ops and you
use `bun run release:tag`. Either way the bump lands via a reviewed PR - no branch-protection bypass.

## Turnstile keys (split by trust boundary)

The Pulumi-provisioned widget yields two values, wired by where they're allowed to live:
- **Site key (public):** a **build-time Vite var** `VITE_TURNSTILE_SITE_KEY`, inlined into the client
  bundle. CI sets it from the Pulumi `turnstileSiteKey` output for the web build; `vite dev` falls
  back to Cloudflare's always-pass test key, so local dev needs no setup. It is never a Worker var.
- **Secret key (server-only):** a **Worker secret** `TURNSTILE_SECRET_KEY`, set in CI from the Pulumi
  `turnstileSecretKey` output; used by the waitlist server fn to verify tokens. Never client-side.

## Pulumi state (R2, not Pulumi Cloud)

The IaC state is stored in a **Cloudflare R2 bucket** via Pulumi's S3-compatible DIY backend, so no
Pulumi Cloud account is needed - everything stays on Cloudflare. `PULUMI_BACKEND_URL` is
`s3://<bucket>?endpoint=<account-id>.r2.cloudflarestorage.com&region=auto&s3ForcePathStyle=true`; the
R2 **S3 API credentials** (`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`, from Cloudflare → R2 → Manage
API Tokens) authenticate it via the standard `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` env vars.
DIY backends **lock** state (file-based, on by default) and seal secret outputs with
`PULUMI_CONFIG_PASSPHRASE` (no cloud KMS). The workflow auto-creates the bucket on first run, so there
is no manual bootstrap. To drive it locally: `pulumi login "$PULUMI_BACKEND_URL"` with the same env.

## Required GitHub config (set these and deploys "just work")

- **Secrets:** `CLOUDFLARE_API_TOKEN` (account: Workers Scripts + R2 + D1 + Turnstile = Edit; zone:
  Workers Routes + DNS + SSL and Certificates = Edit - the README has the exact matrix),
  `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `PULUMI_CONFIG_PASSPHRASE`
  (any strong string), `BETTER_AUTH_SECRET`, `CREDENTIAL_ENCRYPTION_KEY` (the last two:
  `openssl rand -base64 32`), and optional `STRIPE_SECRET_KEY` (the LIVE key - enables billing:
  Pulumi provisions the prices/webhook and the web Worker runs Checkout; omit to keep billing off).
- **Variables:** `APP_DOMAIN` (your apex, e.g. `example.com`); optional `PULUMI_STACK` (default
  `production`) and `PULUMI_STATE_BUCKET` (default `byos3-pulumi-state`).
- **Worker var (optional):** `ALLOW_PRIVATE_S3_ENDPOINTS=true` relaxes the connector SSRF guard to
  permit http + private/loopback endpoints (self-hosted MinIO). Leave unset on a hosted/multi-tenant
  deploy = require https + public hosts. Set it as a Worker var/secret on the web + api Workers (it's
  in the local `.dev.vars`). Cloud instance-metadata hosts are blocked regardless. See `storage-byo-s3.md`.
- The domain's **zone must already exist** in your Cloudflare account (Workers attach the custom
  domains + DNS/TLS automatically). D1 is created by Pulumi and its id injected at deploy - no manual
  `wrangler d1 create` needed. See the repo `README.md` for the full forker walkthrough.
- Infra resource attributes are verified against `@pulumi/cloudflare` 6.17.0 (`D1Database`,
  `TurnstileWidget.sitekey` / `.secret`); re-confirm if you bump the provider major.

## Local commands

```bash
bun install                                   # also installs git hooks (prepare → lefthook)
bun run --filter='@byos3/web' db:migrate:local  # apply D1 migrations to the local DB
bun run dev                                   # vite dev (port 3000; auto-bumps if taken)
bun run lint && bun run format:check && bun run build
```

Local secrets live in plaintext `.dev.vars` (gitignored), generated by `bun run secrets:setup`
(see `secrets.md`); local Turnstile uses Cloudflare's public **test** keys (always pass) so dev
works with no setup.
