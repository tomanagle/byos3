# Phase 0 — Landing page & waitlist

**Goal:** ship a public **landing page** that captures interest (email + optional name) into a **D1
waitlist table** — and in doing so, **prove the entire delivery pipeline** (Bun workspace → TanStack
Start on Workers → D1 → Wrangler deploy → SOPS secrets) end-to-end before any product engineering.
The lowest-risk first deployable.

Design refs: `web-app.md`, `monorepo.md`, `data-model.md`, `api.md`, `secrets.md`, `logging.md`.
Skills: `frontend-design`, `ui-ux-pro-max`, `landing-page-copywriter`, `turnstile-spin`, and
(optional) `cloudflare-email-service`.

## Scope (in)

- **Scaffold the monorepo + app** (the workspace is born here): Bun workspaces; `apps/web` from the
  Cloudflare TanStack Start template; minimal `packages/ui` (shadcn) and `packages/protocol` (the
  waitlist Zod schema). `wrangler.jsonc` with the **D1** binding (`DB`), `nodejs_compat`, current
  compat date, `main: src/server.ts`, observability; `cf-typegen`; `npm run deploy`.
- **Landing page** (`/` route): hero + value proposition (BYO-storage Dropbox — *own your bucket, pay
  for the service not the gigabytes*), an email capture form (email + optional name), thank-you state.
  shadcn via `@byos3/ui`; copy via the landing-page-copywriter skill; polish via frontend-design /
  ui-ux-pro-max.
- **Bot protection:** Cloudflare **Turnstile** on the form (use the `turnstile-spin` skill; Turnstile
  secret managed via SOPS — `secrets.md`).
- **Waitlist capture (API-first):** a public, unauthenticated **`POST /api/v1/waitlist`** route
  (Hono), Turnstile-verified and rate-limited, validating input with the Zod schema in
  `@byos3/protocol`, inserting into the **`waitlist`** D1 table (`data-model.md`). Email is normalized
  (lowercased/trimmed) and **unique** — a duplicate is an idempotent success, not an error. The
  landing form posts to this same endpoint (dogfood the API from day one).
- **Observability:** one wide event per submission (`op: "waitlist.join"`, outcome, `referrer`) —
  never log PII beyond what's necessary (`logging.md`).
- **Read/export:** a simple way to read the list (a platform-admin route later, or `wrangler d1
  execute` for now).

## Scope (out)

Auth, accounts, connectors/volumes, sync, the `Namespace` DO, billing — everything else. (A
double-opt-in confirmation email is **optional/deferred** via the `cloudflare-email-service` skill.)

## Tasks

1. Scaffold the Bun workspace + `apps/web` (TanStack Start) + `packages/{ui,protocol}`; run the SOPS
   secrets bootstrap (`bun run secrets:setup`) including the Turnstile keys.
2. `wrangler.jsonc` with the `DB` (D1) binding; create the `waitlist` migration (Drizzle);
   `cf-typegen`.
3. Landing page UI + copy + Turnstile widget.
4. `POST /api/v1/waitlist`: Zod validate → Turnstile siteverify → rate-limit → upsert into `waitlist`.
5. Thank-you / confirmation UX + client-side validation.
6. `npm run deploy`; verify the live URL; wire a CI deploy.

## Acceptance criteria

- The landing page is **deployed to a public URL** on Workers.
- Submitting email (+ optional name) inserts a row into the `waitlist` D1 table; a **duplicate email
  is handled gracefully** (no error, no duplicate row).
- **Invalid emails are rejected** (Zod) and **bot submissions are blocked** by Turnstile.
- The form posts to **`/api/v1/waitlist`** (API-first), and exactly one wide event is emitted per
  submission.
- Secrets (Turnstile) are SOPS-managed; none appear in logs or the client bundle.

This phase intentionally proves deployment + D1 + secrets + the API-first form path, so Phase 1
(Foundation) builds on a known-good pipeline.
