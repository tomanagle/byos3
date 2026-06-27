# Routing (apps/web)

Path-based, deep-linkable routing for the web app, built on TanStack Start file routes. The screen
is the **path**; volatile state (which folder, which selected file) is **search params**. The
session is resolved once at the root and every route branches on it.

## Route table

| Path | File | Auth | Renders |
|---|---|---|---|
| `/` | `routes/_app.index.tsx` | public | logged in → files workspace; logged out → landing page |
| `/volumes` | `routes/_app.volumes.index.tsx` | protected | connected-buckets manager |
| `/volumes/:id` | `routes/_app.volumes.$volumeId.tsx` | protected | files workspace with volume `:id` as the active upload target |
| `/keys` | `routes/_app.keys.tsx` | protected | API-key minting |
| `/team` | `routes/_app.team.tsx` | protected | org members + seat-gated invitations (billing.md) |
| `/accept-invitation?id=` | `routes/accept-invitation.tsx` | public | invitee joins an org (own centered page, not the workspace shell; prompts sign-in) |
| `/sign-in`, `/sign-up` | `routes/sign-in.tsx`, `sign-up.tsx` | public | Better Auth forms (own `AuthShell`). Accept `?redirect=accept&invite=<id>` to return to `/accept-invitation` after auth, so an invited new user joins that org instead of landing in the workspace (which would lazily create a redundant personal org). |
| `/api/auth/$`, `/api/ns/socket` | `routes/api/**` | n/a | server routes (Better Auth handler, namespace WebSocket) |

`/volumes` and `/volumes/:id` share a passthrough layout (`routes/_app.volumes.tsx`) that guards the
whole subtree and renders into the shell outlet; the bare `/volumes` is its index, `/volumes/:id`
its dynamic child (a volume id, `vol_…`). There is **no `/app`** - the old query-driven
`/app?v=&view=&folder=&sel=` route was replaced by these paths. In the rail, only the bare
`/volumes` highlights "Volumes"; `/volumes/:id` is file-browsing so it highlights "All files" and
the specific volume in the mounted list.

## Auth resolved once, at the root

`routes/__root.tsx` `beforeLoad` calls the `getMe` server fn and returns `{ user }` into the router
context. Every route reads `context.user` (in `beforeLoad` for redirects, via `Route.useRouteContext()`
in components) instead of re-querying. `getMe` returns `null` when signed out rather than throwing.

- `routes/_app.index.tsx` branches on `user`: `<FilesScreen />` vs `<Landing />`.
- Protected routes redirect in `beforeLoad`: `if (!SHOW_WAITING_SCREEN && !context.user) throw redirect({ to: "/sign-in" })`.

## The waitlist gate (`SHOW_WAITING_SCREEN`)

`lib/flags.ts` exports the literal `SHOW_WAITING_SCREEN`. When **true**, the root component renders
`<WaitingScreen />` for **every** route (and root `beforeLoad` skips the auth query); the protected
redirects are also guarded by it so nothing bounces before the waitlist shows. When **false** (the
default) the real app runs: landing when logged out, workspace when logged in. It is a compile-time
constant so the unused branch tree-shakes.

## The persistent shell (`_app` pathless layout)

`routes/_app.tsx` is a pathless layout wrapping `/`, `/:id`, `/volumes`, `/keys`, `/team`:

- **Logged out** → it renders a bare `<Outlet />` so `/` can show the full-bleed landing page (no
  rail/top bar) and protected children redirect.
- **Logged in** → it mounts `<AppShell>` **once**: the top bar, volume rail, transfer toasts, and
  Connect dialog, with an `<Outlet />` for the active screen. Because the layout component stays
  mounted across child navigations, the namespace WebSocket and any in-flight upload toast survive
  moving between files / volumes / keys (they would reset if each screen mounted its own shell).

`AppShell` owns the `volumes` query, the active (drop-target) volume, and the Connect dialog, and
exposes them to screens through `useWorkspace()`. The active volume is the `$volumeId` route param
(on `/:id`) or the first volume (on `/`); the rail's highlighted section is derived from the path.

## Deep-linkable folder + selection

The files routes (`/` and `/:id`) validate `?folder=<gid>&sel=<gid>` in `validateSearch`.
`FilesScreen` reads them with `useSearch({ strict: false })` and updates them with
`useNavigate({ to: ".", search })`, so a pasted URL reopens the exact folder with the same file
selected. Switching folders clears `sel`. Other screens have no search params.

## Conventions

- Navigation state goes in the URL (path + search), never `useState`. UI-only state (dialog open,
  drag-hover) stays local.
- Use `Route.useRouteContext()` for `user`; `useWorkspace()` for volumes / active volume / Connect.
- New top-level screen → add a `routes/_app.<name>.tsx` child (protected via the `beforeLoad` guard)
  and a rail entry; it inherits the shell automatically.
