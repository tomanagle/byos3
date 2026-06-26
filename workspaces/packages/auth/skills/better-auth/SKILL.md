---
name: better-auth
description: >
  Configure byos3 auth with @byos3/auth's createAuth (Better Auth: email/password + organization +
  admin + apiKey). Load when touching sessions, API keys, namespaces-as-organizations, or platform
  roles. Covers the @better-auth/api-key gotchas (it's a SEPARATE package; uses referenceId not userId;
  has configId; setting key permissions is server-only) and session (web) vs Authorization: Bearer (api).
metadata:
  type: core
  library: '@byos3/auth'
  library_version: '0.0.0'
sources:
  - 'tomanagle/byos3:agents/docs/auth.md'
  - 'tomanagle/byos3:agents/docs/api.md'
---

# @byos3/auth - Better Auth config

`createAuth({ db, secret, trustedOrigins, baseURL })` is the single Better Auth instance shared by
both Workers. A **namespace is a Better Auth organization**. Web authenticates by **session cookie**;
the API by **`Authorization: Bearer <key>`** (the apiKey plugin). Both resolve to a `ServiceContext`.

## Setup

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins/organization";
import { admin } from "better-auth/plugins/admin";
import { apiKey } from "@better-auth/api-key"; // SEPARATE package - NOT in better-auth/plugins (BA ≥1.6)
import * as schema from "@byos3/db/auth-schema";

export function createAuth(opts) {
  return betterAuth({
    secret: opts.secret,
    database: drizzleAdapter(opts.db, { provider: "sqlite", schema }),
    emailAndPassword: { enabled: true },
    plugins: [organization({ ac, roles: NAMESPACE_ROLES, /* … */ }), admin({ ac: platformAc, roles: PLATFORM_ROLES }), apiKey()],
  });
}
```

## Core patterns

```ts
// Web composition root: session → principal.
const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });

// API: verify a Bearer key → owner + scopes.
const r = await auth.api.verifyApiKey({ body: { key } });
const userId = r.key.referenceId;                 // NOT r.key.userId
const keyScopes = r.key.permissions ?? undefined; // null = unrestricted (full owner role)

// Mint a SCOPED key - server-only: pass userId, send NO headers (headers re-trigger the client guard).
await auth.api.createApiKey({ body: { userId, name, permissions: { file: ["read"] } } });
```

## Common Mistakes

### CRITICAL Importing `apiKey` from `better-auth/plugins`

Wrong:
```ts
import { apiKey } from "better-auth/plugins"; // not exported there in BA ≥1.6
```

Correct:
```ts
import { apiKey } from "@better-auth/api-key"; // separate package; `admin` IS in better-auth/plugins/admin
```
Source: agents/docs/auth.md.

### CRITICAL Reading the key owner from `userId`

Wrong:
```ts
const userId = result.key.userId; // undefined - the plugin generalized userId → referenceId
```

Correct:
```ts
const userId = result.key.referenceId;
```
The `apikey` table uses `referenceId` (+ a required `configId`); hand-written schemas that omit them throw "field configId/… does not exist". Source: agents/docs/auth.md.

### HIGH Setting key `permissions` via the public/client endpoint

Wrong:
```ts
await auth.api.createApiKey({ body: { permissions }, headers }); // → SERVER_ONLY_PROPERTY
```

Correct:
```ts
await auth.api.createApiKey({ body: { userId, permissions } }); // server-side, no forwarded headers
```
Any `ctx.request || ctx.headers` makes Intent treat it as a client call and reject server-only fields like `permissions`. Source: agents/docs/api.md.

### HIGH Handing the browser a Bearer token instead of a session

Wrong:
```ts
// store an API key in the browser and send Authorization: Bearer from the SPA
```

Correct:
```ts
// Web uses the httpOnly, CSRF-protected session cookie; Bearer keys are for scripts/CI/the API.
```
Source: agents/docs/api.md.
