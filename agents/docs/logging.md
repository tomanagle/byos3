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

A tiny, dependency-light logger. Core type is a **`WideEvent`**: a mutable bag of fields you
enrich through the request, emitted exactly once as one JSON line.

```ts
import { createWideEvent } from "@byos3/logging";

const event = createWideEvent({
  service: "web",                 // which hop: "web" | "namespace-do" | "gc-workflow" | "indexer"
  method, path, requestId, traceId,
  // environment context is attached automatically (see below)
});

try {
  // ...handlers enrich the SAME event...
  event.set({ outcome: "success", status_code: 200 });
  return res;
} catch (err) {
  event.error(err);               // sets outcome:"error", error.{type,code,message,retriable}
  throw err;
} finally {
  event.emit();                   // ONE JSON line, with duration_ms
}
```

API surface (keep it this small):
- `createWideEvent(seed)` — start an event; auto-attaches environment context.
- `event.set(fields)` — merge high-dimensionality fields (idempotent, last-write-wins).
- `event.timed(name, fn)` — run `fn`, record `<name>_ms`. Use for phases (`presign_ms`, `do_ms`,
  `bucket_ms`).
- `event.child(seed)` — derive a correlated event for a downstream hop (carries `traceId`).
- `event.error(err)` — record a typed error (never the stack as a string blob; structured fields).
- `event.emit()` — flush once, as JSON, to `console.log` (Cloudflare ingests it). Must be called
  in a `finally`.

There is **one logger**, configured once. Two levels only: `info` (normal) and `error`. Never log
unstructured strings; never `console.log` raw values in handlers.

## Access without prop-drilling

Create the event in **middleware** and stash it. In the Worker use the request context
(`c.set("event", event)` / `c.get("event")`); within deeper call stacks use `AsyncLocalStorage`
(available under `nodejs_compat`) so any function can `getCurrentEvent().set(...)`. Handlers add
**business context only** — the middleware owns timing, status, environment, and emission.

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

`packages/logging` (the `WideEvent` + single logger + middleware factory). The Worker middleware
lives in `apps/web`; the DO and each Queue/Workflow consumer create their own per-hop event.
