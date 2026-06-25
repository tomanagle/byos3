# Role-based access control (RBAC)

How authorization works in byos3. Built on **Better Auth's access-control system** so one set of
role definitions drives Better Auth *and* our own enforcement in the edge and the Durable Object.
Read with `namespaces-and-acl.md` (the namespace concept), `auth.md`, and `code-architecture.md`
(the `Authorizer` port).

## Three scopes

```
Platform        ── who may administer the SERVICE (staff/support)         → Better Auth ADMIN plugin
   │                user.role: user | support | admin
Namespace       ── who may do what in a WORKSPACE (the tenant boundary)   → Better Auth ORGANIZATION plugin
   │                member.role: owner | admin | writer | reader          (namespace ≡ organization)
Resource grant  ── a role granted on a SUBTREE or via a public link        → our layer, same role vocabulary
                    intra-namespace subtree scoping + public links
```

Authorization is **deny-by-default**. A request is allowed if the platform scope permits it (rare,
audited), OR the caller's namespace role permits it, OR a resource grant on an ancestor of the
target permits it.

## Mapping to Better Auth

- **namespace ≡ Better Auth organization.** A *personal* namespace is a personal org with one
  `owner` member; a *team* namespace is a shared org. This unifies the model and makes the billing
  reference always the **organization id** (`billing.md`). `member` and `invitation` are Better
  Auth's org tables; we extend `organization`/`member` with `additionalFields` rather than keeping
  parallel tables (supersedes the ad-hoc `team`/`member` sketch in `namespaces-and-acl.md`).
- **Platform roles** live on `user.role` via the **admin plugin** (default `user`; plus `support`,
  `admin`). Identifies staff for the admin console, support impersonation, and system ops — *not* a
  tenant role.
- **Resource grants & public links** are our own tables (`grant`, `shareLink` — see Data model),
  reusing the same namespace role definitions so "writer on a subtree" means exactly "writer,
  scoped to that subtree."

## Namespace roles & capability matrix

Resources (AC *statements*) and the actions each role may perform. `organization`, `member`,
`invitation` come from Better Auth's `defaultStatements`; `volume`/`file`/`share`/`ai`/`billing`
are ours. (Connectors are **account-owned by the user**, not org-governed; mounting one into a
namespace is the org action `volume:mount`.)

| Resource → action | owner | admin | writer | reader |
|---|---|---|---|---|
| `organization:update` (settings/rename) | ✓ | ✓ | | |
| `organization:delete` | ✓ | | | |
| `member` create/update/delete, `invitation` create/cancel | ✓ | ✓ | | |
| `volume:mount` / `unmount` / `update` | ✓ | ✓ | | |
| `volume:list` | ✓ | ✓ | ✓ | ✓ |
| `file:read` | ✓ | ✓ | ✓ | ✓ |
| `file:create` / `update` / `delete` / `restore` | ✓ | ✓ | ✓ | |
| `share:create` | ✓ | ✓ | ✓ | |
| `share:revoke` / `list` | ✓ | ✓ | | |
| `ai:query` | ✓ | ✓ | ✓ | ✓ |
| `ai:configure` (toggle `aiEnabled`) | ✓ | ✓ | | |
| `billing:view` | ✓ | ✓ | | |
| `billing:manage` | ✓ | | | |

Members can hold **multiple roles** (Better Auth stores them comma-separated); effective
permissions are the union.

## Platform roles

Admin-plugin resources are `user` (`create|list|get|update|set-role|set-password|set-email|ban|delete|impersonate|impersonate-admins`)
and `session` (`list|revoke|delete`).

| | `admin` | `support` | `user` |
|---|---|---|---|
| `user:list` / `get` | ✓ | ✓ | |
| `user:impersonate` (never admins; **audited**) | ✓ | ✓ | |
| `user:ban` / `delete` / `set-role` / `set-password` | ✓ | | |
| `session:revoke` | ✓ | ✓ | |

**Platform scope never grants ambient read of tenant content.** Support acts on a user's data only
by **impersonation** — which mints a real session subject to normal namespace RBAC — and every
impersonation/admin action emits a wide event (`logging.md`).

## The permission model — one source of truth

Define the access-control statements and roles **once** in `@byos3/core/authz`. Better Auth's
plugins consume them; our own `authorize()` evaluates them offline (in the edge *and* the DO).

```ts
// @byos3/core/authz/policy.ts
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/organization/access";

export const statement = {
  ...defaultStatements,                               // organization, member, invitation
  volume:  ["mount", "unmount", "update", "list"],
  file:    ["read", "create", "update", "delete", "restore"],
  share:   ["create", "revoke", "list"],
  ai:      ["query", "configure"],
  billing: ["view", "manage"],
} as const;

export const ac = createAccessControl(statement);

export const reader = ac.newRole({ file: ["read"], ai: ["query"], volume: ["list"] });
export const writer = ac.newRole({
  ...reader.statements,
  file: ["read", "create", "update", "delete", "restore"], share: ["create"],
});
export const admin = ac.newRole({
  ...adminAc.statements,                              // member/invitation/organization:update
  volume: ["mount", "unmount", "update", "list"],
  file:  ["read", "create", "update", "delete", "restore"],
  share: ["create", "revoke", "list"], ai: ["query", "configure"], billing: ["view"],
});
export const owner = ac.newRole({
  ...admin.statements, organization: ["update", "delete"], billing: ["view", "manage"],
});

export const NAMESPACE_ROLES = { owner, admin, writer, reader } as const;
export type Role = keyof typeof NAMESPACE_ROLES;
```
(Confirm the exact `*Ac` exports against the installed Better Auth version — `defaultStatements`
and `adminAc` are documented; `ownerAc`/`memberAc` may also exist.)

`roleCan` is the offline primitive used everywhere:

```ts
export function roleCan(role: Role, resource: string, action: string): boolean {
  return NAMESPACE_ROLES[role].authorize({ [resource]: [action] }).success;
}
```

The platform AC is defined the same way from `better-auth/plugins/admin/access` (`PLATFORM_ROLES`
= `{ admin, support, user }`).

## Resource-scoped grants & public links

> **Cross-user folder sharing is a *shared namespace* mounted into members' roots** (the mount model
> — `namespaces-and-acl.md`, `foundational-considerations.md` §2), **not** a grant. The grants below
> are for *intra-namespace* subtree role scoping and public links only.

Beyond org-wide roles, a principal can be granted a role on a **subtree**:

- **`grant`** — `(namespaceId, subtreeNodeGid, principalType: user|email, principalId, role)`. The
  grantee gets that role's permissions *for nodes under `subtreeNodeGid`*. Used for **intra-namespace
  subtree scoping** (narrowing/granting a member's role on a subtree). **Cross-user sharing is the
  mount model (a shared namespace), not a grant** — see `namespaces-and-acl.md`.
- **`shareLink`** — a tokenized capability: `(namespaceId, subtreeNodeGid, tokenHash, role, expiresAt,
  passwordHash?)`. Anonymous read of a subtree; maps to a synthetic `reader` (or download-only)
  permission. Bytes still come direct from the volume via a presigned GET.

**Effective permission** for a request on node *N* = the union of:
1. the caller's namespace role (if a member), and
2. every `grant` whose `subtreeNodeGid` is an ancestor of *N* (or *N*) for that principal, and
3. a valid `shareLink` token covering *N* (read only).

Deny if none permit the action.

## Resource-level sharing (connectors & volumes)

Connectors and volumes are **shared per-resource**, not via namespace membership (a deliberate
product choice — simpler "invite a person to this drive" UX). A user holds a **resource role** on a
specific connector/volume; access is decided by that role, independent of any namespace.

- **`connector.ownerUserId`** is a real FK to `user`. The owner is seeded as a `full` member on
  connect; `connector_member` / `volume_member` `(userId, resourceId, role)` hold the shares.
- **Roles** (`@byos3/core/authz` `ResourceRole`): `read_only` (list/read/download — reader-equiv),
  `read_write` (+ file CRUD + create shares — writer-equiv), `full` (+ manage/rename/delete the
  resource and its members — admin). Built from the same AC statement vocabulary via `resourceCan`.
- **Enforcement**: `@byos3/services` `assertCanVolume(ctx, volumeId, action)` /
  `assertCanConnector(...)` resolve the caller's resource role (`ResourceAccessRepository`) and call
  `resourceCan`; for API keys the action must ALSO be within the key scope (intersection — still
  narrows). `listVolumes` returns the volumes the caller is a member of. Managing members
  (`shareVolume`/`unshareVolume`) requires `full`.
- **Storage vs access**: a volume keeps a `namespaceId` — its **sync/DO home** (where its journal
  lives) — but that is *storage*, not the access boundary. Access is the resource role.

> This **supersedes**, for connectors/volumes, the "sharing = a shared namespace mounted into roots"
> model in `namespaces-and-acl.md §3`. That mount model + the `grant`/`shareLink` subtree tools
> still apply *within* a volume's namespace for finer file-tree sharing (and remain the plan for
> team workspaces). Deep cross-share *move* semantics are a known future consideration.

## Enforcement architecture

Authorization is a **use-case in `@byos3/core`** (a port from `code-architecture.md`), enforced in
**two places** for defense in depth:

```ts
// @byos3/core/authz/authorize.ts
export function authorize(i: {
  principal: { userId: string; platformRole?: PlatformRole };
  membership?: { role: Role } | null;     // caller's role in this namespace
  grants?: Grant[];                        // grants applying to the target path
  link?: ShareLink | null;                 // a validated public-link token, if any
  action: `${string}:${string}`;           // e.g. "file:create"
  node?: { gid: string; path: string };
}): { allow: boolean; reason: string } {
  const [res, act] = i.action.split(":");
  // 1. platform: only administrative actions; tenant content is reached via impersonation, not override
  if (i.principal.platformRole && isPlatformAction(i.action)
      && PLATFORM_ROLES[i.principal.platformRole].authorize({ [res]: [act] }).success)
    return { allow: true, reason: "platform" };          // audited by caller
  // 2. namespace role
  if (i.membership && roleCan(i.membership.role, res, act)) return { allow: true, reason: "role" };
  // 3. resource grants on ancestors
  for (const g of i.grants ?? [])
    if (covers(g.subtreeNodeGid, i.node) && roleCan(g.role, res, act))   // covers = ancestor check by gid
      return { allow: true, reason: "grant" };
  // 4. public link (read only)
  if (i.link && i.action === "file:read" && covers(i.link.subtreeNodeGid, i.node))
    return { allow: true, reason: "link" };
  return { allow: false, reason: "denied" };
}
```

- **Edge (Worker server fn / API route):** a `requirePermission(ctx, { action, node? })` helper
  resolves the caller's membership + grants and calls `authorize()` before delegating. It is the
  single guard used by every handler. (Better Auth's `auth.api.hasPermission` is also available for
  pure org-role checks, but `requirePermission` is preferred because it also covers grants/links and
  is identical to what the DO runs.)
- **Durable Object (single writer):** the DO re-authorizes **every mutation** against its **cached
  membership + grants projection** (refreshed on change and by TTL, like the entitlement cache —
  `data-model.md`), using the same `authorize()`. The canonical store is Better Auth's `member`
  table in D1; the DO projection is for fast inline checks.

**Trust boundary:** client → Worker (authenticated via Better Auth session) → DO (trusts the
Worker-asserted principal — same security domain; the client never calls the DO directly).
WebSocket connections are authorized at **upgrade** in the Worker and the principal is bound to the
socket (`serializeAttachment`), so the DO authorizes each WS message too.

**Two auth methods, one model.** A request is authenticated by a **session** (web) or an **API key**
(programmatic) — both resolve to the same `Principal` (`api.md`). For an API-key request, `authorize()`
also takes the key's **`keyScopes`**, and the action must pass the role/grant check **and** the key
scope (intersection). A key can only *narrow* its owner's permissions, never exceed them. API key
`permissions` use the same `resource: [actions]` vocabulary as the statements above.

## Better Auth wiring & checks

```ts
// apps/web — auth config
import { organization, admin as adminPlugin } from "better-auth/plugins";
import { ac, NAMESPACE_ROLES } from "@byos3/core/authz";
import { platformAc, PLATFORM_ROLES } from "@byos3/core/authz/platform";

export const auth = betterAuth({
  plugins: [
    organization({ ac, roles: NAMESPACE_ROLES,
      schema: { organization: { additionalFields: {
        type: { type: "string" },              // "personal" | "team"
        defaultVolumeId: { type: "string", required: false },
      } } } }),
    adminPlugin({ ac: platformAc, roles: PLATFORM_ROLES, adminRoles: ["admin", "support"], defaultRole: "user" }),
    // stripe(...) — see billing.md
  ],
});
```

- **Server check:** `auth.api.hasPermission({ headers, body: { permissions: { file: ["create"] } } })`
  (uses the session's **active organization** + member role); `auth.api.userHasPermission({ body:{ role, permissions } })`
  for the platform/admin plugin.
- **Client check:** `authClient.organization.hasPermission({ permissions })` (round-trip) or
  `authClient.organization.checkRolePermission({ role, permissions })` (sync, static roles — for UI
  gating). Admin equivalents on `authClient.admin`.
- **Active organization** = the namespace the user is currently in (`setActive` /
  `useActiveOrganization`); server checks resolve the member role from it.
- **Invitations** (org plugin) drive team onboarding; accepting creates a `member` row + (we) emit
  a journal membership op so the DO projection updates and connected clients are notified.
- **Dynamic access control** (DB-stored custom org roles) is available but **deferred** — our four
  roles are static for now.

## Billing tie-in

`billing:manage` (owner-only) is the permission gate for Stripe checkout/portal; it pairs with the
Stripe plugin's `authorizeReference` (owner of the org `referenceId`). See `billing.md`.

## Data model impact

D1 (Better Auth-owned): `organization` (= namespace, extended with `type`, `defaultVolumeId`),
`member` (`role`, comma-separated), `invitation`, `session.activeOrganizationId`; `user.role`
(platform). Ours: `grant` and `shareLink` (above). DO SQLite: `member` + `grant` **projections**
for inline authz. Update `data-model.md` references accordingly.

## Security properties

- **Deny-by-default**, evaluated identically at the edge and in the single-writer DO (no path
  mutates without an authz check).
- **One source of truth** (`@byos3/core/authz`) — Better Auth and our enforcement can't drift.
- **Least privilege roles**: reader can't write, writer can't manage members/volumes/billing, only
  owner touches billing and namespace deletion.
- **Platform staff get no ambient tenant-data access** — content is reached only via audited
  impersonation, which then obeys namespace RBAC.
- **Grants are subtree-scoped** and reuse role definitions, so a share can never exceed the role's
  actions.
- **Every authz decision and impersonation is logged** as a wide event (never secrets/URLs).

## Where the code lives

- `@byos3/core/authz` — `ac`, `statement`, `NAMESPACE_ROLES`, `PLATFORM_ROLES`, `roleCan`,
  `authorize()`, grant/link types. Imported by the Better Auth config **and** the DO.
- `apps/web` — Better Auth plugin config, `requirePermission` edge helper, D1 `grant`/`shareLink`
  repositories, WS upgrade authorization.
- The `Namespace` DO — membership/grant projection + inline `authorize()` on every mutation.

## Do / don't

- ✅ Gate every namespace operation with `requirePermission` (edge) and `authorize()` (DO).
- ✅ Add a new permission as a statement action + role grant in `@byos3/core/authz` — nowhere else.
- ✅ Use impersonation (audited) for support, never a content-reading override.
- ❌ Don't check `role === "admin"` inline — call `roleCan`/`authorize`.
- ❌ Don't define roles/permissions in `apps/web`; they live in `@byos3/core/authz`.
- ❌ Don't trust a client-supplied role/permission — resolve it server-side from the session.
