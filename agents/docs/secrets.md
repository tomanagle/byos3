# Secrets management (SOPS + age)

We manage the Worker's **platform secrets** with [SOPS](https://github.com/getsops/sops) using
**age** encryption. Two environments for now: **local** (per-developer, gitignored) and **prod**
(committed, encrypted).

## Two kinds of credentials — don't conflate them

| | **Platform secrets** (this doc) | **End-user bucket credentials** |
|---|---|---|
| What | The Worker's own keys: `CREDENTIAL_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, OAuth secrets | A user's S3/R2/B2 access keys for their connector |
| Who provides | Us (developers/ops) | The end user, at runtime, in the app |
| Stored | SOPS files → Wrangler secrets / `.dev.vars` | Envelope-encrypted in **D1** by `packages/crypto` |
| Encrypted with | age (SOPS) | `CREDENTIAL_ENCRYPTION_KEY` (which is itself a platform secret) |

So SOPS protects the **root key** that in turn protects users' bucket creds. See
`storage-byo-s3.md` for the runtime side.

## Files

```
.sops.yaml                    creation rules (prod recipients); committed
secrets/secrets.example.env   template listing required keys (empty values); committed
secrets/prod.sops.env         PRODUCTION secrets, SOPS-encrypted; COMMITTED (safe — encrypted)
secrets/local.sops.env        YOUR local secrets, SOPS-encrypted; GITIGNORED
.dev.vars (in apps/web)       plaintext generated from local; GITIGNORED; read by wrangler/vite
```

Why is `local` gitignored even though SOPS-encrypted? Project decision: local secrets are personal
(your own Stripe test keys, your own dev root key) and never need sharing. Prod is the only shared,
committed encrypted file.

## First-time local setup

```bash
brew install sops age          # one-time, if missing
bun run secrets:setup          # interactive
```

`scripts/setup-secrets.ts`:
1. ensures an **age key** at the SOPS default path (`~/.config/sops/age/keys.txt`), generating one
   if needed (so decryption "just works" with no env vars);
2. prompts for each secret — **auto-generating** random values for `CREDENTIAL_ENCRYPTION_KEY` and
   `BETTER_AUTH_SECRET` (just press enter), and letting you paste Stripe test keys;
3. writes `secrets/local.sops.env` encrypted to **your** age key;
4. writes `apps/web/.dev.vars` (plaintext) for local dev.

Re-run anytime to change values. After pulling someone else's changes (or regenerating), refresh
the plaintext without re-prompting:

```bash
bun run secrets:setup --sync   # decrypt local.sops.env → .dev.vars
```

> Input is echoed to the terminal — run it somewhere private.

## Production

1. **Recipients:** put your team/CI **age public key(s)** in `.sops.yaml` under the
   `secrets/prod.sops.env` rule (comma-separate multiple). Generate one with
   `age-keygen -o ~/.config/sops/age/keys.txt` and copy its `public key:` line.
2. **Edit prod secrets:** `sops secrets/prod.sops.env` opens an editor; SOPS encrypts on save. The
   file is created/encrypted per `.sops.yaml`. Commit it (it's encrypted).
3. **Deploy to the Worker:** `bun run secrets:deploy` decrypts prod and pushes every key via
   `wrangler secret bulk`. Requires a private key that can decrypt prod.

## package.json scripts (added in Phase 0)

```jsonc
{
  "scripts": {
    "secrets:setup":  "bun scripts/setup-secrets.ts",
    "secrets:deploy": "bun scripts/deploy-secrets.ts"
  }
}
```

## Rules

- **Never commit** plaintext secrets, `.dev.vars`, `secrets/local.sops.env`, or any `keys.txt` age
  key (all gitignored).
- **Never log** secret values or presigned URLs (see `logging.md`).
- Rotate by editing the SOPS file and re-deploying; rotating `CREDENTIAL_ENCRYPTION_KEY` requires
  re-wrapping stored user creds — treat as a migration (`crypto` package concern).
- The file format is **dotenv** (`KEY=value`), so SOPS output maps directly to `.dev.vars` and to
  `wrangler secret bulk` JSON.
