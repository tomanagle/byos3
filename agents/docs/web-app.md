# Web app

`apps/web` is a **TanStack Start** application that **is the Worker** — it serves the React UI,
hosts **server functions** (the UI's data layer), the Better Auth handler, and exports the
`Namespace` Durable Object. See the Cloudflare framework guide and `monorepo.md` for config.

## Structure

```
apps/web/src/
  server.ts        custom entry: export { Namespace } DO + the Start handler
  routes/          TanStack Router routes (UI). The ONLY routes/api/* HTTP handler is api/auth/$
                   (Better Auth's client requires real HTTP endpoints). No /api/v1 routes.
  fn/              server functions = the web UI's data layer (createServerFn, type-safe RPC)
  lib/             middleware (auth → ServiceContext), client helpers, auth/stripe clients
  components/      app components (compose @byos3/ui primitives)
```

## Two transport surfaces, shared core

- **Web → server functions.** The UI calls `createServerFn` functions (`fn/*.ts`) over
  `@byos3/services` — same-origin, in-process during SSR, session-authed (via the `authMiddleware`
  that builds a `ServiceContext`). This is the web's **only** data path; there are **no `/api/v1`
  HTTP routes** in the web (even the public waitlist form is `fn/waitlist.ts`). The lone HTTP route
  is the Better Auth catch-all `api/auth/$`.
- **Programmatic → `apps/api`.** The public, versioned, API-key HTTP surface is a separate Hono
  Worker (`api.byos3.com`, `api.md`), also thin over `@byos3/services`.
- Both validate the **same `@byos3/protocol` schemas** and authorize in the service — neither holds
  business logic (`conventions.md`). Bindings via `import { env } from "cloudflare:workers"`. See
  `api.md` "Web data access" for why the UI doesn't call the API Worker.

## UI: shadcn/ui via `@byos3/ui`

As built (Phase 0): shadcn/ui components (`Button`, `Input`, `Label` — cva + `@radix-ui/react-slot`)
live in **`apps/web/src/components/ui`** with the shadcn theme tokens in `src/styles.css`
(`@theme inline`, a custom dark + acid-lime palette, Tailwind v4). They import `cn` from
**`@byos3/ui`** (the shared util). `components.json` is configured for `npx shadcn@latest add`.
*Why in the app, not `packages/ui` yet:* Tailwind v4 ignores `node_modules` for content scanning, so
a shared `packages/ui` needs `@source` wiring — promote shared primitives there in a later phase.

**Data layer (TanStack Query):** a `QueryClientProvider` is mounted in `__root.tsx`; mutations
(e.g. the waitlist submit) use `useMutation`. Reads use `useQuery`, invalidated on the WebSocket
"poke" (Phase 2+). The `@tanstack/react-router-ssr-query` integration is available for query
dehydration when needed.

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

## Navigation state lives in the URL (deep-linkable)

The workspace is **fully addressable**: the active volume, the path within it, the current screen,
and the selected file are **URL search params** (`/app?v=<volumeId>&path=<prefix>&view=<files|volumes|keys>&sel=<key>`),
validated in the `/app` route's `validateSearch`. The shell reads them via `getRouteApi("/app").useSearch()`
and mutates them with `useNavigate({ search })` — never `useState` for navigation. So copying the
address bar and pasting it in another tab lands on the **same volume + path + selection with no extra
clicks**, and the state survives refresh, back/forward, and SSR (verified: `?view=keys` server-renders
the keys screen). Folder navigation and the breadcrumb just push a new `path`; switching volumes resets
`path`/`sel`. UI-only state (e.g. whether the connect dialog is open) stays in `useState`.

## Data fetching

Use **TanStack Query** over server functions; invalidate on WebSocket pokes. Optimistic updates
for renames/moves (cheap metadata ops). See the `tanstack-query` and `tanstack-start-best-practices`
skills.

## Logging

The Worker middleware creates one **wide event** per request (`@byos3/logging`); UI interactions
are observed server-side via those events, not client `console.log`. See `logging.md`.
