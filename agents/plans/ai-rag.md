# Deferred - AI / RAG across documents

**Status: deferred** (build when prioritized). The seam is designed in now; see
`agents/docs/ai-rag.md` for the architecture and the single sanctioned exception to the no-bytes
rule.

Design refs: `ai-rag.md`, `billing.md`, `namespaces-and-acl.md`, `logging.md`.

## Scope (in)

- Enable bindings: `AI` (Workers AI), `VECTORIZE`, `INDEX_QUEUE`.
- `node.aiEnabled` opt-in per folder; plan-gated (`limits.ai` quota).
- **Indexer** (Queue consumer): on `addVersion` of an AI-enabled node → server-side presigned GET →
  extract text → semantic-chunk → embed (Workers AI) → upsert to Vectorize with
  `{namespace_id, node_gid, version_id}`. Remove stale vectors on delete/new version.
- **Query**: embed question → Vectorize search filtered by `namespace_id` (and ACL) → LLM answer
  with citations. Server fn + `/api/v1`; metered against `limits.ai`.
- `packages/ai` houses pipeline + query logic.

## Tasks

1. Provision Vectorize index + Workers AI models; wire the Queue.
2. Indexer consumer with text extraction per mime type; idempotent upserts; `traceId` logging.
3. Query endpoint with namespace + ACL filtering; citation mapping.
4. Plan gating + quota metering; `aiEnabled` UI toggle per folder.

## Acceptance criteria

- Answers cite the correct documents and **never** retrieve across namespaces or beyond a user's
  ACL.
- Indexing is the **only** server-side path that reads file bytes; it runs only for `aiEnabled`,
  plan-entitled folders; bytes are not logged.
- AI usage is metered against the plan quota; free tier has no access.
