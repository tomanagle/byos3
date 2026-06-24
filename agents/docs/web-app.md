# Web app

`apps/web` is a **TanStack Start** application that **is the Worker** — it serves the React UI,
hosts server functions and `/api/v1` HTTP routes, and exports the `Namespace` Durable Object. See
the Cloudflare framework guide and `monorepo.md` for config.

## Structure

```
apps/web/src/
  server.ts        custom entry: export { Namespace } DO + the handler
  routes/          TanStack Router routes (file browser, settings, billing, connectors)
  server-fns/      server functions = the web UI's data layer (type-safe RPC)
  api/v1/          stable HTTP routes (the future desktop daemon's contract)
  components/       app components (compose @byos3/ui primitives)
  lib/             client helpers: hashing, multipart upload, auth/stripe clients
```

## Two transport surfaces, shared core

- **Server functions** — ergonomic, type-safe calls for the web UI. Thin wrappers over
  `@byos3/core`. Used for browser → server interactions.
- **`/api/v1/*` HTTP routes** — the **stable, versioned, public contract** for *all* programmatic
  clients: user **API keys** and the future desktop daemon (byos3 is **API-first** — `api.md`).
  Authenticated by session **or** API key via a unified middleware → `Principal`. Thin wrappers over
  the same `@byos3/core`, so the API has full parity with the web.
- Neither holds business logic (convention in `conventions.md`). Bindings via
  `import { env } from "cloudflare:workers"`.

## UI: shadcn/ui via `@byos3/ui`

Components live in **`packages/ui`** (shadcn primitives + Tailwind preset + `components.json`),
consumed here and reusable by a later Electron desktop client. Add components with
`npx shadcn@latest add <comp>` into `packages/ui`. The **shadcn MCP** (via the `ui-ux-pro-max`
skill) helps search/pull components. Keep app-specific composition in `apps/web/src/components`;
keep primitives in `@byos3/ui`.

## Client responsibilities (the no-bytes rule on the web)

The browser does the heavy lifting so bytes never hit the Worker:

1. **Hash** the file with Web Crypto (SHA-256) to build the blocklist (`@byos3/core`, isomorphic).
2. **`commit-intent`** (server fn) → get missing chunk hashes + presigned PUT URLs for the chosen
   volume.
3. **Upload** missing chunks / multipart parts **directly to the bucket** via `fetch(PUT)`.
4. **`commit`** → DO appends the version; UI advances.
5. **Download:** read blocklist → presigned GET chunks direct from the volume → reassemble (e.g.
   stream to a Blob / File System Access API).

## Key UI surfaces

- **File browser** — tree per namespace; shows which **volume** each item lives on; a **volume
  picker** to choose the drop target (the multi-connector requirement).
- **Connectors/Volumes settings** — connect a bucket (provider creds → validated), mount volumes,
  preset CORS config, set the default drop volume.
- **Billing** — plan, usage vs `limits`, upgrade/portal (Better Auth Stripe client).
- **Real-time** — a WebSocket to the namespace DO; on a "poke", invalidate queries and pull deltas.

## Data fetching

Use **TanStack Query** over server functions; invalidate on WebSocket pokes. Optimistic updates
for renames/moves (cheap metadata ops). See the `tanstack-query` and `tanstack-start-best-practices`
skills.

## Logging

The Worker middleware creates one **wide event** per request (`@byos3/logging`); UI interactions
are observed server-side via those events, not client `console.log`. See `logging.md`.
