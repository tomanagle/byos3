---
name: use-cases
description: >
  Add or change byos3 business logic by writing a @byos3/services use-case (connectBucket,
  uploadIntent, downloadUrl, listVolumes, …). Load when implementing a capability that both the web
  app and the API expose, wiring a ServiceContext, or deciding where authorization goes. Covers the
  one-core-two-transports rule, assertCan, and why transports stay thin with no dynamic imports.
metadata:
  type: core
  library: '@byos3/services'
  library_version: '0.0.0'
sources:
  - 'tomanagle/byos3:agents/docs/code-architecture.md'
  - 'tomanagle/byos3:agents/docs/api.md'
---

# @byos3/services — use-cases

**One core, two transports.** Every capability is a `@byos3/services` use-case. The web's TanStack
server functions and the `apps/api` Hono routes are *thin wrappers* over the same use-case — parity
is structural. **All business logic and authorization live in the service**, never in a transport.

## Setup

```ts
// A use-case: authenticate is the transport's job; the service authorizes + does the work.
import type { ServiceContext } from "@byos3/services";
import { assertCan } from "@byos3/services";

export async function downloadUrl(ctx: ServiceContext, input: { volumeId: string; hash: string }) {
  const volume = await ctx.volumes.get(input.volumeId);          // hydrated entity from a repo port
  await assertCan(ctx, volume.namespaceId, "file:read");          // RBAC ∩ keyScopes, deny-by-default
  return volume.presignGet(volume.chunkKey(input.hash), { expiresIn: 300 });
}
```

`ServiceContext = { principal, connectors, volumes, memberships, vault, driverFactory }`;
`Principal = { userId; platformRole?; keyScopes? }`. It's built by each transport's composition root
(web `ctx.ts` from a session, api `auth` middleware from a Bearer key).

## Core patterns

```ts
// Transport stays thin — static imports, validate input, build ctx, call the use-case, map errors.
// apps/api (Hono): app.openapi(route, (c) => c.json(await connectBucket(c.get("ctx"), c.req.valid("json"))))
// apps/web (server fn): createServerFn().middleware([authMiddleware]).inputValidator(ConnectBucketInput)
//                         .handler(({ context, data }) => connectBucket(context.ctx, data))
```

Both transports validate the **same `@byos3/protocol` schema object** (e.g. `ConnectBucketInput`) — one
schema validates and (in the API) documents.

## Common Mistakes

### CRITICAL Authorizing in the transport instead of the service

Wrong:
```ts
// in the Hono route / server fn
if (!userCanRead) return c.json({ error: "forbidden" }, 403);
return downloadUrl(ctx, input); // service does NOT re-check → other callers bypass authz
```

Correct:
```ts
return downloadUrl(ctx, input); // assertCan lives INSIDE the use-case; every caller is checked
```
Authz in the transport is duplicated and skippable; the service is the single choke point. Source: agents/docs/code-architecture.md.

### HIGH Putting business logic in the route/server function

Wrong:
```ts
app.openapi(route, async (c) => { const v = await db.query…; /* seal, probe, insert… */ });
```

Correct:
```ts
app.openapi(route, async (c) => c.json(await connectBucket(c.get("ctx"), c.req.valid("json"))));
```
Logic in one transport means it's missing from the other; keep it in `@byos3/services`. Source: agents/docs/api.md.

### HIGH Using a dynamic `await import()` for server-only modules

Wrong:
```ts
const { connectBucket } = await import("@byos3/services"); // banned
```

Correct:
```ts
import { connectBucket } from "@byos3/services"; // static — server.handlers routes & Hono routers are server-only
```
TanStack Start keeps `server.handlers` modules (and their imports) out of the client bundle, so static imports are safe. Source: agents/docs/code-architecture.md.

### MEDIUM Reading `env`/bindings outside the composition root

Wrong:
```ts
import { env } from "cloudflare:workers"; // inside a use-case
```

Correct:
```ts
// Only ctx.ts (web) / the api db+auth middleware read env and build the ServiceContext.
```
Use-cases depend on injected ports, never globals. Source: agents/docs/code-architecture.md.
