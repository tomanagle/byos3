# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security problems.** Report privately via GitHub's
[private vulnerability reporting](https://github.com/tomanagle/byos3/security/advisories/new)
(repo **Security → Report a vulnerability**). We aim to acknowledge within 3 business days and will
coordinate a fix and disclosure timeline with you.

When reporting, include where possible: affected component (web app, API Worker, a `packages/*`
module, or the deploy pipeline), reproduction steps, and impact.

## Supported versions

This is pre-1.0 software. Only the latest release (`main` / the most recent `v*` tag) is supported;
fixes ship in a new tagged release rather than backports.

## Security model (what to keep in mind)

byos3 is a bring-your-own-S3 app; a few invariants are load-bearing, and breaking them is itself a
vulnerability:

- **Bytes never pass through the Worker.** Clients transfer files directly to the user's bucket via
  presigned URLs. A code path that streams object content through a Worker is a bug.
- **Bucket credentials are envelope-encrypted at rest** (`packages/crypto`) with
  `CREDENTIAL_ENCRYPTION_KEY`; the connector secret is unwrapped only inside `Connector.driver()`
  and is never logged, returned, or exposed as a field.
- **Secrets are never logged** - not credentials, not presigned URLs, not session/API tokens. Logs
  are structured wide events; see `agents/docs/logging.md`.
- **Platform secrets live in `.dev.vars` (local, gitignored) or GitHub Actions secrets (prod)** -
  never committed. See `agents/docs/secrets.md`.

## Out of scope

- Vulnerabilities in a deployer's own Cloudflare account, S3/R2 bucket, or misconfigured secrets.
- Findings that require an already-compromised maintainer machine or GitHub account.
- Denial of service from unbounded self-hosted usage.
