# AI / RAG across documents (LATER — seam only)

**Status: deferred.** This documents the *seam* we design in now so it can be built without
rework. Nothing here is active until the AI phase (`plans/ai-rag.md`).

## Goal

Let users ask questions across their documents ("RAG"): semantic search + grounded answers over
the files in a namespace, scoped and isolated per namespace, gated by subscription plan.

## Building blocks (Cloudflare-native)

- **Workers AI** — embeddings model + an LLM for answers.
- **Vectorize** — vector index; per-namespace isolation via metadata (`{namespace_id, node_gid,
  version_id}`) filtering. (We use Vectorize rather than **AutoRAG**, which only indexes R2, because
  our content lives in arbitrary BYO buckets.)
- **Queues** — drive the indexing pipeline asynchronously.

## The one sanctioned exception to "bytes never touch the Worker"

RAG must read file content. So the indexer is the **only** place server-side code fetches bytes —
and it is **opt-in per folder** (`node.aiEnabled`, default false) and **plan-gated**. It fetches
via a server-side presigned GET from the file's **volume**, extracts text, and discards the bytes.
This exception is explicit and narrow; do not generalize it.

## Indexing pipeline

On `addVersion` for an AI-enabled node → enqueue an index job (carry `traceId` for logging):
1. Fetch the file from its volume (presigned GET, server-side).
2. Extract text (by mime type) and chunk it (semantic/overlapping windows — distinct from storage
   chunking).
3. Embed chunks with Workers AI.
4. Upsert vectors to Vectorize with `{namespace_id, node_gid, version_id}` metadata.
5. On delete / new version, remove stale vectors.

## Query

Embed the question → Vectorize search **filtered to the namespace** → assemble retrieved passages
→ LLM answer with citations back to `node_gid`/version. Exposed as a server function + `/api/v1`
route, plan-gated, metered against the plan's `ai` quota (`billing.md`).

## Isolation & safety

- **Never** let a query cross namespace boundaries — always filter by `namespace_id`.
- Respect the `member` ACL: a reader can query only what they can read.
- Each pipeline step emits a wide event (`logging.md`); the indexer never logs file contents.

## Package

`packages/ai` holds the pipeline + query logic; the Queue consumer lives alongside the Worker.
Bindings: `AI` (Workers AI), `VECTORIZE`, `INDEX_QUEUE` (see `monorepo.md`). Dormant until built.
