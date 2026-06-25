---
name: storage-core
description: >
  Use @byos3/s3 to talk to S3-compatible buckets (AWS S3, R2, B2, Wasabi, MinIO) through the single
  StorageDriver port. Load when presigning GET/PUT, listing/heading/deleting objects, probing a
  bucket, adding a provider, or wiring uploads/downloads. Covers createDriver, ProviderCapabilities,
  path-style addressing, and the rule that file bytes NEVER pass through the Worker.
metadata:
  type: core
  library: '@byos3/s3'
  library_version: '0.0.0'
sources:
  - 'tomanagle/byos3:agents/docs/storage-byo-s3.md'
  - 'tomanagle/byos3:agents/docs/storage-providers.md'
  - 'tomanagle/byos3:agents/docs/s3-compatibility.md'
  - 'tomanagle/byos3:agents/docs/code-architecture.md'
---

# @byos3/s3 — storage driver

Every provider is reduced to one `StorageDriver` interface. Provider differences are **data**
(`ProviderCapabilities` rows), never `if (provider === …)` branches. The driver only ever *signs*
requests — clients transfer bytes **directly** to the user's bucket via presigned URLs.

## Setup

```ts
import { createDriver } from "@byos3/s3";

// In the domain layer you get a driver via Connector.driver(bucket) (it unwraps the sealed secret).
// Direct construction is for tests / one-offs:
const driver = createDriver({
  provider: "s3", // "s3" | "r2" | "b2" | "wasabi" | "minio"
  endpoint: "https://s3.us-east-1.amazonaws.com",
  region: "us-east-1",
  accessKeyId: "AKIA…",
  secret: "…", // captured privately by the driver; never assigned to a field or logged
  bucket: "my-bucket",
});
```

## Core patterns

```ts
// Presign — short TTL, pinned method/headers. The URL is a bearer token (never log it).
const put = await driver.presignPut("byos3/chunks/<sha256>", { expiresIn: 300 });
const get = await driver.presignGet("byos3/chunks/<sha256>", { expiresIn: 300 });
// → { url, method, headers?, expiresAt } — return this to the client; it PUTs/GETs the bytes itself.

// Read-only existence/size + best-effort connectivity check.
const head = await driver.headObject("byos3/chunks/<sha256>"); // ObjectHead | null
const ok = await driver.probe(); // ListObjectsV2(prefix, max-keys=1) → { ok, reason? }

// Capability-gated features throw a typed error on providers that lack them — don't branch on provider.
if (driver.capabilities.corsViaS3Api) await driver.putCors(rules);
```

## Common Mistakes

### CRITICAL Streaming object bytes through the Worker

Wrong:
```ts
const obj = await driver.getObject(key);      // no such method — and would route bytes through workerd
return new Response(obj.body);
```

Correct:
```ts
const { url } = await driver.presignGet(key); // client fetches the bytes directly from the bucket
return Response.json({ url });
```
Bytes through the Worker blow the CPU/memory limits and break the BYO-S3 model; the only sanctioned exception is the plan-gated AI indexer. Source: agents/docs/storage-byo-s3.md.

### HIGH Branching on `provider ===` instead of a capability flag

Wrong:
```ts
if (config.provider === "r2") { /* skip POST */ }
```

Correct:
```ts
if (driver.capabilities.presignedPost) { /* … */ } // add a provider = add a CAPABILITIES row, not an if
```
Provider divergence lives in `capabilities.ts` as data; scattered `provider ===` checks rot. Source: agents/docs/storage-providers.md.

### HIGH Using virtual-host addressing for S3-compatible providers

Wrong:
```ts
fetch(`https://${bucket}.${host}/${key}`); // breaks MinIO / many S3-compatible endpoints
```

Correct:
```ts
// The SigV4 driver uses PATH-STYLE (https://endpoint/bucket/key) — required for broad compatibility.
await driver.presignGet(key);
```
Source: agents/docs/s3-compatibility.md.

### MEDIUM Logging or returning the presigned URL / secret

Wrong:
```ts
logger.info({ presignedUrl: get.url }); // bearer token in logs
```

Correct:
```ts
logger.info({ op: "presign", key, expiresAt: get.expiresAt }); // metadata only
```
Presigned URLs grant access until they expire; the connector secret is sealed in the driver closure and must never be read back. Source: agents/docs/code-architecture.md.
