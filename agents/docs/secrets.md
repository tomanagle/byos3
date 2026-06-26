# Secrets management

The Worker's **platform secrets** are plaintext `.dev.vars` files locally (gitignored) and **GitHub
Actions secrets** in production (the deploy workflow pushes them to the Workers with
`wrangler secret put`). No SOPS, no age, no encrypted files in the repo.

## Two kinds of credentials - don't conflate them

| | **Platform secrets** (this doc) | **End-user bucket credentials** |
|---|---|---|
| What | The Worker's own keys: `CREDENTIAL_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `TURNSTILE_SECRET_KEY`, `STRIPE_*`, OAuth secrets | A user's S3/R2/B2 access keys for their connector |
| Who provides | Us (developers / ops) | The end user, at runtime, in the app |
| Stored | `.dev.vars` (local) / Wrangler secrets (prod) | Envelope-encrypted in **D1** by `packages/crypto` |
| Protected by | gitignore (local) + Cloudflare secret storage (prod) | `CREDENTIAL_ENCRYPTION_KEY` (itself a platform secret) |

So `CREDENTIAL_ENCRYPTION_KEY` is the **root key** that protects users' bucket creds. See
`storage-byo-s3.md` for the runtime side, `code-architecture.md` for the sealed-credential pattern.

The web + api Workers bind the **same** D1, so they must share the **same**
`CREDENTIAL_ENCRYPTION_KEY` and `BETTER_AUTH_SECRET`.

## Local development

```bash
bun run secrets:setup          # writes workspaces/apps/{web,api}/.dev.vars (skips existing)
bun run secrets:setup --force  # regenerate (rotates the keys)
```

`scripts/setup-secrets.ts` generates a random `CREDENTIAL_ENCRYPTION_KEY` + `BETTER_AUTH_SECRET`
(the same value in both files), fills the Turnstile **test** secret, and leaves optional keys
(Stripe) blank. Or copy `workspaces/apps/web/.dev.vars.example` to `.dev.vars` and fill it yourself.
`wrangler dev` / vite read `.dev.vars` automatically.

## Production (GitHub Actions)

Set these as repo **secrets** (Settings → Secrets and variables → Actions):
`CREDENTIAL_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET` (each `openssl rand -base64 32`). `TURNSTILE_SECRET_KEY`
is provisioned by Pulumi, not stored in GitHub. On deploy, `.github/workflows/deploy.yml` runs
`wrangler secret put` for each, on **both** Workers (after deploying them). See `deployment.md` +
the repo `README.md` for the full secret/variable list.

## Rules

- **Never commit** plaintext secrets or `.dev.vars` (gitignored; `.dev.vars.example` is the only
  committed template, and it carries no real values).
- **Never log** secret values or presigned URLs (see `logging.md`).
- Rotate prod by changing the GitHub secret and re-running the deploy. Rotating
  `CREDENTIAL_ENCRYPTION_KEY` requires re-wrapping stored user creds - treat it as a migration (a
  `crypto` package concern), not a casual change.
- The file format is **dotenv** (`KEY=value`), read directly by `wrangler dev` / vite.
