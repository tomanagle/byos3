# Logging — wide events / canonical log lines

We follow the philosophy from **https://loggingsucks.com** (Boris Tane) and the
`logging-best-practices` skill: **log _what happened to this request_, not _what your code is
doing_.** Instead of scattering log lines, we emit **one wide, structured event per request per
service hop** — a single canonical log line carrying 50+ high-cardinality fields, built up over
the request and emitted once at the end.

> A single request creates a single large span. Scattered `console.log` calls are an anti-pattern
> here — if you reach for one, you almost certainly want to add a field to the request's wide
> event instead.

## The package: `@byos3/logging`

A tiny, dependency-light logger modelled as **spans**. The **root `Span` IS the canonical wide
event**: a mutable bag of fields you enrich through the request, emitted exactly once as one JSON
line at `end()`. A child `span(name)` times a sub-operation — its fields fold into the *same* event
under a `<name>.` prefix and it stamps `<name>.duration_ms` — so you still get one event per
request, now with nested timings. Children never emit their own line.

```ts
import { createServiceLogger } from "@byos3/logging";

const { createSpan } = createServiceLogger({ service: "web" }); // hop: web | byos3-api | namespace-do | …

const span = createSpan({ "web.request_id": requestId, "web.path": path });

try {
  const presign = span.span("presign", { provider });  // child timing
  // ...do the work...
  presign.end();                                        // stamps presign.duration_ms

  // ...handlers enrich the SAME root span via span.set(...)...
  span.set({ outcome: "success", status_code: 200 });
  return res;
} catch (err) {
  span.setError(err);             // sets error.message + error.type
  span.set({ outcome: "error", status_code: 500 });
  throw err;
} finally {
  span.end();                     // ONE JSON line, with duration_ms
}
```

API surface (keep it this small):
- `createServiceLogger({ service }).createSpan(seed)` (or `createSpan(seed, opts)`) — start the root
  span; auto-attaches environment context.
- `span.set(fields)` / `span.set(key, value)` — merge high-dimensionality fields (last-write-wins).
- `span.span(name, seed?)` — open a child span; its `set`/`setError` write under `<name>.` and
  `end()` stamps `<name>.duration_ms`. Use for phases (`presign`, `do`, `bucket`). Nestable.
- `span.setError(err)` — record `error.message` + `error.type` (never the stack as a string blob).
- `span.end()` — child: stamp its `<name>.duration_ms`; root: stamp `duration_ms` + flush ONE JSON
  line to `console.log` (Cloudflare ingests it). Idempotent. The root `end()` must run in a `finally`.

There is **one logger**, configured once. Two levels only: `info` (normal) and `error`. Never log
unstructured strings; never `console.log` raw values in handlers.

## Access without prop-drilling

Create the span in **middleware** and stash it. In `apps/web` it rides the server-fn context
(`context.span`, set by `loggingMiddleware`); in `apps/api` (Hono) use `c.set("span", span)` /
`c.get("span")`. Within deeper call stacks use `AsyncLocalStorage` (available under `nodejs_compat`)
so any function can reach the current span. Handlers add **business context only** — the middleware
owns timing, status, environment, and emission.

## One event per hop, correlated by `traceId`

A file operation touches several services: **Worker request → Namespace DO → bucket calls**, and
async **Queue/Workflow** jobs. Each hop emits its **own** wide event, all sharing the same
`traceId` (and a per-hop `spanId`). Propagate `traceId` explicitly across boundaries: pass it into
DO RPC/message payloads and into Queue messages. This lets you reconstruct a whole operation by
`traceId` in the analytics store.

## Fields every event carries

**Environment (auto):** `service`, `version`/`commit_hash`, `deployment_id`, `region` /
`cf.colo`, `timestamp`. **Request:** `requestId`, `traceId`, `spanId`, `method`, `path`,
`status_code`, `duration_ms`, `outcome`. **Identity & business:** `user_id`, `namespace_id`,
`namespace_type` (personal|team), `plan` (free|pro|team), `seats_used`, `device_id`. **Domain:**
`op` (e.g. `commit`, `commit-intent`, `download`, `move`), `node_gid`, `volume_id`, `provider`
(s3|r2|b2), `journal_seq`, `chunks_total`, `chunks_missing`, `bytes`, `multipart` (bool),
`conflict` (bool). **Phases:** `presign_ms`, `do_ms`, `bucket_ms`. **Errors:** `error.type`,
`error.code`, `error.message`, `error.retriable`, `provider_error_code`.

Always include `user_id`/`namespace_id` (high cardinality) so you can answer *"a Pro customer
couldn't commit a 2 GB file to their B2 volume"*, not just *"commit failed"*.

## Never log

- Secrets, access keys, connector ciphertext, or **presigned URLs** (they're bearer tokens).
- Raw file bytes or full blocklists (log counts/sizes, not contents).
- Unstructured strings or multiple lines per request.

## Sampling (tail sampling at the ingestion edge)

Keep **100%** of: errors, requests over p99 latency, team/VIP accounts, and feature-flag rollouts.
Randomly sample fast successful requests at **1–5%**. Sampling happens at the pipeline, not by
dropping `event.set()` calls — always build the full event; decide whether to keep it at emit/ship.

## Cloudflare delivery

`observability.enabled: true` is set in `wrangler.jsonc`. Wide events go to `console.log` as JSON;
ship via **Workers Logs / Logpush** to a columnar store (ClickHouse / BigQuery) for
high-cardinality querying. A **tail worker** can apply sampling and forwarding.

## Where the code lives

`packages/logging` (the `Span` type + `createSpan` / `createServiceLogger`). The server-fn logging
middleware lives in `apps/web` (`src/lib/middleware.ts` → `context.span`); the Hono `spanMiddleware`
lives in `apps/api` (`src/middleware/span.ts` → `c.get("span")`). The DO and each Queue/Workflow
consumer create their own per-hop root span.
