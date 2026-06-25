---
name: authz
description: >
  Enforce byos3 authorization with @byos3/core/authz — namespace roles (owner/admin/writer/reader),
  the createAccessControl statements, roleCan/authorize, and the deny-by-default check. Load when
  adding a permission check, defining a new resource:action, gating a use-case, or reasoning about
  how API-key scopes (keyScopes) intersect a user's role. Authorization happens in services, not transports.
metadata:
  type: core
  library: '@byos3/core'
  library_version: '0.0.0'
sources:
  - 'tomanagle/byos3:agents/docs/rbac.md'
  - 'tomanagle/byos3:agents/docs/api.md'
---

# @byos3/core/authz — RBAC

One access-control vocabulary, defined once with Better Auth's `createAccessControl`, consumed by
both the Better Auth organization plugin AND our offline `authorize()`. Roles are
`owner > admin > writer > reader`. Deny-by-default: no matching grant ⇒ denied.

## Setup

```ts
import { authorize, roleCan, type Role } from "@byos3/core/authz";

// Statement vocabulary (resource: [actions]) — e.g. volume:[mount,unmount,update,list],
// file:[read,create,update,delete,restore], share:[create,revoke,list], ai:[query,configure].
const allowed = roleCan("writer", "file", "create"); // true
```

## Core patterns

```ts
// The deny-by-default use-case. keyScopes is present ONLY for API-key requests (it narrows the role).
const decision = authorize({
  principal: { userId, platformRole },           // platformRole governs the SERVICE, never tenant content
  membership: role ? { role } : null,            // the caller's namespace role
  action: "file:read",
  keyScopes,                                       // Record<resource, actions[]> | undefined
});
if (!decision.allow) throw new AppError("forbidden", "file:read");
```

In a service this is wrapped by `assertCan(ctx, namespaceId, "file:read")`, which resolves the role
via `ctx.memberships`, runs `authorize()`, AND intersects `ctx.principal.keyScopes`.

## Common Mistakes

### CRITICAL Effective permission isn't role ∩ keyScopes

Wrong:
```ts
if (roleCan(role, "file", "create")) allow(); // ignores the API key's narrower scopes
```

Correct:
```ts
const scopeOk = !keyScopes || keyScopes.file?.includes("create");
if (decision.allow && scopeOk) allow(); // a key can only NARROW its owner's role, never exceed it
```
A scoped CI key must not be able to do everything its owner can. Source: agents/docs/api.md.

### HIGH Using platformRole to authorize tenant content

Wrong:
```ts
if (principal.platformRole === "admin") allowFileWrite(); // platform admin ≠ tenant access
```

Correct:
```ts
// platformRole (admin/support/user) governs administering the SERVICE; tenant content uses the
// namespace member role. authorize() only lets platform roles act on platform resources.
```
Source: agents/docs/rbac.md.

### HIGH Treating a missing membership as allowed

Wrong:
```ts
const role = await memberships.roleFor(userId, nsId);
return presign(); // never checked role — non-members get in
```

Correct:
```ts
await assertCan(ctx, namespaceId, "file:read"); // null role → authorize() denies (deny-by-default)
```
Source: agents/docs/rbac.md.

### MEDIUM Inventing a resource:action not in the statements

Wrong:
```ts
authorize({ …, action: "bucket:download" }); // not in the createAccessControl statements
```

Correct:
```ts
// Add the action to the statement map in policy.ts (and to the roles that should have it) FIRST,
// then use "file:read". Unknown resource:action pairs deny.
```
Source: agents/docs/rbac.md.
