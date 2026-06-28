# byos3

A file storage and sync app where you **bring your own S3-compatible bucket** (AWS S3, Cloudflare R2,
Backblaze B2, Wasabi, MinIO, or any custom S3 endpoint). Your files live in storage you own; byos3
keeps only encrypted credentials and never sees your bytes (clients transfer directly to the bucket
via presigned URLs).

**Self-hosting is a first-class path.** Deploy your own instance with just GitHub secrets/variables -
no code changes. **Billing is optional:** leave `STRIPE_SECRET_KEY` unset and subscriptions are
disabled entirely - every feature is unlocked for everyone, no plan limits, no seat caps. Add a
Stripe key only if you actually want to charge.

It runs on Cloudflare Workers as a Bun monorepo: a TanStack Start web app (`workspaces/apps/web`) and
a Hono OpenAPI Worker (`workspaces/apps/api`) over a shared services layer. Architecture and
conventions live in [`agents/docs/`](./agents/docs/) (start at [`AGENTS.md`](./AGENTS.md)).

## Local development

```bash
bun install
bun run secrets:setup            # generate local secrets → workspaces/apps/{web,api}/.dev.vars (gitignored)
bun run --filter='@byos3/web' db:migrate:local   # apply D1 migrations to the local DB
bun run dev                      # vite dev server for the web app
```

Or run both Workers in containers (web + api sharing one local D1), with auto-migrations and HMR:

```bash
bun run docker:up                # web → :4500 · api → :8788 · docs → :8789
bun run docker:logs              # follow logs (containers run detached)
bun run docker:down              # stop
```

End-to-end tests (Playwright + a real MinIO bucket): `bun run e2e`. See [`dev/README.md`](./dev/README.md).

## Deploy your own (Cloudflare + GitHub Actions)

Everything deploys from `.github/workflows/deploy.yml`, triggered by pushing a **version tag**
(`v*`). To run your own copy you **only set GitHub secrets and variables** - no code changes. The
workflow injects your domain and secrets at deploy time.

### Prerequisites

1. A **Cloudflare** account, with your domain added as a **zone** (so Workers can attach custom
   domains and provision DNS + TLS), your **account id**, and an **API token** scoped to the exact
   permissions in [Cloudflare API token permissions](#cloudflare-api-token-permissions) below.
2. **R2 S3 API credentials** (Cloudflare → R2 → **Manage R2 API Tokens** → Create API token →
   _Object Read & Write_; it shows an **Access Key ID** + **Secret Access Key** once). Pulumi stores
   its infrastructure state in an R2 bucket - **no Pulumi Cloud account needed** - and you pick a
   `PULUMI_CONFIG_PASSPHRASE` to encrypt the secrets inside that state.

   Why a _second_ credential when you already have the API token? R2 has two auth planes. The
   **`CLOUDFLARE_API_TOKEN`** talks to the Cloudflare REST API and manages buckets - the workflow uses
   it to **create** the state bucket for you (`wrangler r2 bucket create`), so there's no manual
   bootstrap. But Pulumi reads/writes the state **file** through R2's **S3-compatible** endpoint,
   which only accepts AWS-style (SigV4) signing with these **R2 S3 keys** - a Cloudflare API token
   can't sign S3 object requests. So: API token = create the bucket (control plane); R2 S3 keys =
   read/write the state object inside it (data plane).

### Set these in GitHub → Settings → Secrets and variables → Actions

**Secrets**

| Name | What |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token - exact scopes in [permissions](#cloudflare-api-token-permissions) |
| `CLOUDFLARE_ACCOUNT_ID` | your Cloudflare account id |
| `R2_ACCESS_KEY_ID` | R2 S3 API access key id (for the Pulumi state bucket) |
| `R2_SECRET_ACCESS_KEY` | the paired R2 S3 API secret |
| `PULUMI_CONFIG_PASSPHRASE` | encrypts secrets inside the Pulumi state - `openssl rand -base64 32`. **Set once and never change it** (it decrypts existing state); **back it up** outside GitHub (Actions secrets are write-only) |
| `BETTER_AUTH_SECRET` | random 32+ char string - `openssl rand -base64 32` |
| `CREDENTIAL_ENCRYPTION_KEY` | 32-byte base64 key - `openssl rand -base64 32` |
| `STRIPE_SECRET_KEY` | **optional** - your **live** Stripe key. Enables billing: Pulumi provisions the product/prices/webhook and the app runs Checkout. **Omit to run with billing disabled (everything unlocked).** |
| `AUTH_GITHUB_CLIENT_SECRET` | **optional** - GitHub OAuth app secret; enables "Continue with GitHub" (pair with `AUTH_GITHUB_CLIENT_ID`). Omit for email/password only. |
| `RELEASE_PAT` | **optional** - fine-grained PAT (Contents: read+write). Lets `auto-tag.yml` tag + deploy automatically when a release PR merges. Omit and tag manually with `bun run release:tag`. |

**Variables**

| Name | Example | What |
| --- | --- | --- |
| `APP_DOMAIN` | `example.com` | your apex domain (the zone in your CF account) |
| `PULUMI_STACK` | `production` | the Pulumi stack name (optional, default `production`) |
| `PULUMI_STATE_BUCKET` | `byos3-pulumi-state` | R2 bucket for state (optional, auto-created) |
| `AUTH_GITHUB_CLIENT_ID` | `Iv1.abc123` | **optional** - GitHub OAuth app client id (not secret; pairs with `AUTH_GITHUB_CLIENT_SECRET`). May be a Secret instead. |
| `DEPLOY_WEB` | `true` | **optional**, default `true`. Set `false` to skip deploying the web app. |
| `DEPLOY_API` | `true` | **optional**, default `true`. Set `false` to skip deploying the API Worker. |
| `DEPLOY_DOCS` | `true` | **optional**, default `true`. Set `false` to skip publishing the API reference site. |

> **Minimum to self-host:** the six secrets above through `CREDENTIAL_ENCRYPTION_KEY`, plus the
> `APP_DOMAIN` variable. Everything else is optional - skip Stripe (billing off, all features
> unlocked), skip GitHub OAuth (email/password only), and leave the `DEPLOY_*` flags unset to deploy
> all three surfaces.

### Cloudflare API token permissions

`CLOUDFLARE_API_TOKEN` drives both Pulumi (provisioning) and Wrangler (deploy, migrations, bucket
create). Create it at **My Profile → API Tokens → Create Token**. Fastest correct route: start from
the **"Edit Cloudflare Workers"** template, then add the rows marked **(add)**. (Cloudflare's token
UI labels edit-level access as **Write** - it's the same as **Edit** below.)

**Account** permissions (set _Account Resources_ → your account):

| Permission | Access | Why |
| --- | --- | --- |
| Workers Scripts | Edit | deploy the web / api / docs Workers and `wrangler secret put` |
| Workers R2 Storage | Edit | `wrangler r2 bucket create` for the Pulumi state bucket |
| D1 | Edit **(add)** | Pulumi creates the database; `wrangler d1 migrations apply --remote` |
| Turnstile | Edit **(add)** | Pulumi creates the Turnstile widget |
| Account Settings | Read | Wrangler account lookup (already in the template) |

**Zone** permissions (set _Zone Resources_ → your domain's zone only):

| Permission | Access | Why |
| --- | --- | --- |
| Workers Routes | Edit | attach the Workers to their routes (already in the template) |
| DNS | Edit **(add)** | custom domains create the proxied DNS records for `APP_DOMAIN` / `api.` / `docs.` |
| SSL and Certificates | Edit **(add)** | custom domains provision the edge TLS certificate per hostname |

Scope it tightly: _Account Resources_ to the single account you deploy to, _Zone Resources_ to just
your domain's zone. The template may also grant Workers KV Storage (Edit) - harmless, leave it. Note
the Pulumi **state** read/write uses the separate `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` S3 keys,
not this token; this token's R2 permission is only for creating the bucket.

### Deploy

Releases are version tags, and `main` is protected (no admin bypass needed):

```bash
bun run release minor   # bump on a release/* branch + open a PR (CI gates it)
# ...review + merge the PR...
```

With the **`RELEASE_PAT`** secret set, merging the PR is the whole release: `auto-tag.yml` tags
`v<version>` on `main` and the deploy runs. Without it, finish manually:

```bash
git switch main && git pull && bun run release:tag   # pushes the tag → triggers the deploy
```

(Or cut the tag by hand: `git tag v1.0.0 && git push origin v1.0.0`, or run the **Deploy** workflow
manually from the Actions tab.) The tag triggers the pipeline, which will:

1. **Pulumi** (state in your R2 bucket, created if missing) provisions a D1 database and a Turnstile
   widget for `APP_DOMAIN`.
2. The real D1 id, Turnstile site key, and `APP_DOMAIN` are injected into the Workers' configs -
   including the `custom_domain` routes, so the web Worker attaches to **`APP_DOMAIN`**, the API
   Worker to **`api.APP_DOMAIN`**, and the docs Worker to **`docs.APP_DOMAIN`** (Cloudflare
   auto-creates the proxied DNS records + edge TLS).
3. Migrations are applied to the remote D1, the Workers deploy (incl. the API reference site built
   from the OpenAPI spec), and the app secrets are set.

That's it: `https://APP_DOMAIN` (app), `https://api.APP_DOMAIN` (API), and `https://docs.APP_DOMAIN`
(API reference) come up on your domain. There is intentionally no `app.` subdomain. Full detail and
the Pulumi/Wrangler split are in [`agents/docs/deployment.md`](./agents/docs/deployment.md).

## Contributing

Contributions welcome - see [`CONTRIBUTING.md`](./CONTRIBUTING.md) for setup and the PR workflow, and
[`AGENTS.md`](./AGENTS.md) for architecture. Report security issues privately per
[`SECURITY.md`](./SECURITY.md).

## License

[MIT](./LICENSE) © Tom Nagle
