# Code architecture & patterns

How code is structured across packages so each service's complexity is encapsulated behind a small
common interface, and so the result is secure, testable, and obvious to humans and agents. Read
with `conventions.md` (house style) and `storage-providers.md` (capability flags).

## The pattern, in one breath

**Hexagonal (ports & adapters) + rich domain entities as thin facades + a single composition root
+ capability-scoped credentials.**

- **Ports** = the common interfaces (`StorageDriver`, repositories, `Vault`, `Logger`). Code
  depends on these, never on a concrete provider.
- **Adapters** = the implementations (one per S3 provider, D1 repos, the crypto vault). They live
  *inside* their package and are not exported; only the port + a factory is.
- **Entities** (`Volume`, `Connector`, `Namespace`) = ergonomic domain objects that *compose*
  ports. This is the `volume.presignGet(...)` surface you interact with.
- **Composition root** = the one place (`apps/web/src/server/ctx.ts`) that reads `env` bindings and
  wires concrete adapters into a `Ctx`. Nothing else touches globals.
- **Capabilities** = credentials are never data on an object; they're sealed inside a driver
  closure that can *sign* but not *reveal*.

> One package = one bounded context = one public `index.ts`. Everything else in the package is
> internal. To use a service you import its port/entity/factory; you never reach into its guts.

## Dependency direction

```
        apps/web, apps/desktop                (composition roots + transport)
                 │  depend on ▼
        @byos3/core   ── entities (Volume, Connector, Namespace), use-cases, ports
                 │            ▲ implemented by
   ┌─────────────┼────────────┴───────────────┐
@byos3/s3   @byos3/crypto   D1 repos (in app)  │   ← adapters
   │             │                             │
        @byos3/protocol  (Zod schemas, DTOs, ID brands, capability types)  ← shared vocabulary, depends on nothing
```

Dependencies point **inward** toward `protocol`. `core` and `s3` are **isomorphic** (only Web-std
`fetch`/`SubtleCrypto`), so they run in the Worker, the browser, and the desktop daemon
identically. The *only* server-only thing is the secret **value** the vault unwraps — never the
code (see "Security").

## The ports (the common interfaces)

### `StorageDriver` — the one that matters most

Every provider is reduced to this single interface. Provider differences live behind
`capabilities`, not behind scattered `if (provider === …)`.

```ts
// @byos3/s3 — public port
export interface PresignedRequest {
  url: string;
  method: "GET" | "PUT";
  headers?: Record<string, string>;  // headers the client must echo (e.g. Content-Type)
  expiresAt: string;                  // ISO; the URL is a bearer token — never log it
}

export interface MultipartUpload {
  uploadId: string;
  presignPart(partNumber: number, opts?: PresignOptions): Promise<PresignedRequest>;
  complete(parts: { partNumber: number; etag: string }[]): Promise<{ etag: string }>;
  abort(): Promise<void>;
}

export interface StorageDriver {
  readonly capabilities: ProviderCapabilities;            // from storage-providers.md
  probe(): Promise<{ ok: boolean; reason?: string }>;     // ListObjectsV2(prefix, max-keys=1)
  presignGet(key: string, opts?: PresignOptions): Promise<PresignedRequest>;
  presignPut(key: string, opts?: PresignOptions): Promise<PresignedRequest>;
  headObject(key: string): Promise<ObjectHead | null>;
  deleteObject(key: string, opts?: { versionId?: string }): Promise<void>;
  listObjects(prefix: string, opts?: ListOptions): Promise<ListPage>;
  createMultipartUpload(key: string): Promise<MultipartUpload>;
  putCors(rules: CorsRule[]): Promise<void>;              // throws CapabilityError if !capabilities.corsViaS3Api
  getCors(): Promise<CorsRule[]>;
}
```

### Other ports

- **Repositories** (`ConnectorRepository`, `VolumeRepository`, …) — interfaces declared in `core`;
  concrete D1/Drizzle implementations live in `apps/web` (so `core` never imports D1).
- **`Vault`** (`@byos3/crypto`) — `seal(plaintext) → cipher` / `open(cipher) → plaintext`. Envelope
  encryption under `CREDENTIAL_ENCRYPTION_KEY` (see `secrets.md`).
- **`Logger`** (`@byos3/logging`) — the wide-event logger (`logging.md`).
- **`DriverFactory`** — `(config) => StorageDriver`; production impl is `createDriver`, injectable
  for tests (a fake/MinIO-backed driver).

## The adapters (where S3 complexity is encapsulated)

Internal to `@byos3/s3`; only the port + factory + capability table are exported.

```ts
// @byos3/s3/src/factory.ts
export function createDriver(config: DriverConfig): StorageDriver {
  const caps = CAPABILITIES[config.provider];          // capabilities.ts — the matrix as data
  switch (config.provider) {
    case "aws":
    case "wasabi":
    case "scaleway":
    case "hetzner":
    case "tigris":   return new SigV4Driver(config, caps);                 // shared base
    case "r2":       return new R2Driver(config, caps);                    // region=auto, no POST
    case "b2":       return new B2Driver(config, caps);                    // versioned delete
    case "minio":
    case "gcs":
    case "oci":      return new SigV4Driver({ ...config, forcePathStyle: true }, caps);
  }
}
```

`SigV4Driver` (the aws4fetch-based base) handles the common wire protocol. The few real outliers
**override one method each** (`B2Driver.deleteObject` resolves a `versionId`; `R2Driver` rejects
POST). Favor composition; the thin SigV4 base is the only sanctioned inheritance. Adding a provider
= add a `CAPABILITIES` row + (usually) zero new code.

## The entities (the ergonomic surface)

Entities are **thin facades** that compose ports. They hold a validated record + injected deps,
expose domain methods, and own scoping/guard logic. No persistence logic, no global access.

```ts
// @byos3/core/src/connector.ts
export class Connector {
  constructor(
    private readonly record: ConnectorRecord,
    private readonly deps: { vault: Vault; driverFactory: DriverFactory },
  ) {}
  get id() { return this.record.id; }
  get provider() { return this.record.provider; }
  get capabilities() { return this.record.capabilities; }

  /** Build a driver with the secret unwrapped in-memory and SEALED inside the driver closure. */
  async driver(bucket: string): Promise<StorageDriver> {
    const secret = await this.deps.vault.open(this.record.secretCipher); // plaintext lives only here
    return this.deps.driverFactory({
      provider: this.record.provider,
      endpoint: this.record.endpoint,
      region: this.record.region,
      accessKeyId: this.record.accessKeyId,
      secret,                       // captured privately by the adapter; never assigned to `this`
      bucket,
    });
  } // `secret` goes out of scope; no method ever returns or logs it
}
```

```ts
// @byos3/core/src/volume.ts
export class Volume {
  constructor(
    private readonly record: VolumeRecord,
    private readonly deps: { connector: Connector; logger: Logger },
  ) {}
  get id() { return this.record.id; }
  get provider() { return this.deps.connector.provider; }

  /** Content-addressed key for a chunk, always under this volume's prefix. */
  chunkKey(sha256: string): string { return `${this.#prefix()}chunks/${sha256}`; }

  /** Server-only: mint a presigned GET. Bytes flow client↔bucket; the URL is never logged. */
  async presignGet(key: string, opts: PresignOptions = {}): Promise<PresignedRequest> {
    const driver = await this.deps.connector.driver(this.record.bucket);
    return this.deps.logger.timed("presign", () =>
      driver.presignGet(this.#scoped(key), { expiresIn: 300, ...opts }));
  }
  async presignPut(key: string, opts: PresignOptions = {}): Promise<PresignedRequest> {
    const driver = await this.deps.connector.driver(this.record.bucket);
    return driver.presignPut(this.#scoped(key), { expiresIn: 300, ...opts });
  }
  async multipart(key: string): Promise<MultipartUpload> {
    return (await this.deps.connector.driver(this.record.bucket)).createMultipartUpload(this.#scoped(key));
  }

  #prefix() { return this.record.prefix.endsWith("/") ? this.record.prefix : `${this.record.prefix}/`; }
  /** Hard guard: every key is forced under the volume's prefix — you cannot presign outside it. */
  #scoped(key: string) {
    const k = key.startsWith(this.#prefix()) ? key : `${this.#prefix()}${key}`;
    if (!k.startsWith(this.#prefix())) throw new AppError("scope_violation");
    return k;
  }
}
```

Note `Namespace` is the odd one out: it's a **stateful single-writer Durable Object** (journal +
tree), not a request-scoped facade. It uses the same repository-style access to its own SQLite but
lives in the DO (see `sync-engine.md`, `data-model.md`). `Volume`/`Connector` are stateless,
request-scoped, and safe to construct per call.

## The composition root & how you actually use it

```ts
// apps/web/src/server/ctx.ts — the ONLY module that reads bindings
import { env } from "cloudflare:workers";
export function createCtx(): Ctx {
  const logger = createLogger({ service: "web", version: env.CF_VERSION_METADATA?.id });
  const vault  = new CredentialVault(env.CREDENTIAL_ENCRYPTION_KEY);
  const db     = drizzle(env.DB);
  const connectors = new D1ConnectorRepository(db, { vault, driverFactory: createDriver });
  const volumes    = new D1VolumeRepository(db, { connectors, logger }); // returns hydrated Volume entities
  return { logger, vault, db, connectors, volumes };
}
```

```ts
// a server function — thin: authorize, resolve entity, delegate (no business logic here)
export const downloadUrl = createServerFn({ method: "POST" })
  .validator(z.object({ volumeId: VolumeId, hash: Sha256 }))   // @byos3/protocol schemas
  .handler(async ({ data, context }) => {
    const ctx = context.ctx;                                   // attached by request middleware
    await requirePermission(ctx, { action: "file:read" });     // RBAC guard (rbac.md)
    const volume = await ctx.volumes.get(data.volumeId);       // hydrated entity
    return volume.presignGet(volume.chunkKey(data.hash), { expiresIn: 300 });
  });
```

### About `new Volume({ id })`

The ergonomics you want — `volume.presignGet(...)` — are exactly preserved. The one change from the
sketch: **resolve through the repository (`await ctx.volumes.get(id)`) instead of `new Volume({ id })`.**
Why:

- An entity built from just an `id` must do hidden async I/O to load its record/connector — but
  constructors can't be async, so you'd get lazy loads that fail late, can't cache, and surface
  "not found" deep inside `presignGet`.
- Reaching for the DB/credentials from inside the entity means **ambient access to secrets** — the
  opposite of what we want. The repository is the single, auditable place that loads a record,
  resolves its `Connector`, checks it exists, and injects deps.
- `new Volume(record, deps)` still exists — it's what the repository calls. You just don't
  hand-construct entities with unresolved ids in app code.

This is the **Repository + Entity (data-mapper)** shape, deliberately *not* Active Record (no
entity-owns-its-connection, no ambient globals).

## Security properties this buys

- **No ambient credentials.** Nothing can sign without a `Vault` + `Connector`, both injected from
  the one composition root. There is no global "current credentials."
- **Secrets are a sealed capability, not data.** Plaintext exists only as a local in
  `Connector.driver()`, captured privately by the driver closure. No entity field, getter, or log
  path exposes it. The driver can *sign*, never *reveal*.
- **Credential methods are server-only by construction.** The browser/daemon get no `Vault`, so
  `presignGet`/`presignPut` simply aren't wired there — they call the server, which returns only a
  `PresignedRequest`. This is how "bytes never through the Worker" stays true (`storage-byo-s3.md`).
- **Prefix scoping is enforced in code.** `#scoped()` forces every key under the volume's prefix; you cannot
  presign outside the volume even if a caller passes a bad key.
- **Presigned URLs are bearer tokens** — short TTL, pinned method/headers, never logged
  (`logging.md`).
- **Provider divergence is data, not control flow.** Capability-gated methods (`putCors`) throw a
  typed `CapabilityError` instead of silently misbehaving on a provider that lacks the feature.

## Errors & results

`@byos3/core` throws a small typed `AppError` union (`{ code, ... }`, codes like
`volume_not_found`, `scope_violation`, `capability_unsupported`, `provider_error`). Transport edges
map `code → HTTP status`. **Never** surface raw provider error text or credentials to clients/logs;
wrap them. Background jobs (Queues/Workflows) catch and record the typed error in their wide event.

## Why this is understandable for agents & humans

- **One entrypoint per package.** To learn a service, read its `index.ts`: ports + factory +
  entities. Adapters are internal and don't clutter the surface.
- **Uniform shape.** Every provider implements the same `StorageDriver`; every entity is
  `(record, deps)`; every dependency is a named port. Once you've read one, you can predict the
  rest.
- **One place wires the world.** `createCtx` is the only file reading `env`. Tracing "where does
  this credential/binding come from?" is a single hop.
- **Capabilities are greppable.** Provider differences are rows in `capabilities.ts`, not `if`s
  spread across the codebase.
- **Testable by substitution.** Inject a fake `DriverFactory` or a MinIO-backed driver, an
  in-memory repository, a no-op logger — no globals to stub. (See `s3-compatibility.md` for the
  MinIO conformance harness.)

## Checklist (do / don't)

- ✅ Add behavior as an entity method or a `core` use-case; keep server fns / routes thin.
- ✅ Depend on a port; obtain concrete impls only from `Ctx`.
- ✅ Get a driver via `connector.driver(bucket)`; let `Volume` scope keys.
- ✅ Add a provider via a `CAPABILITIES` row (+ an override only if truly divergent).
- ❌ Don't `new Volume({ id })` in app code — use `ctx.volumes.get(id)`.
- ❌ Don't read `env`/bindings outside the composition root.
- ❌ Don't store, return, or log a secret or a presigned URL.
- ❌ Don't branch on `provider ===` for behavior that belongs in a capability flag.
