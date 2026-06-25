import { z } from "@hono/zod-openapi";
import { ConnectBucketInput } from "@byos3/protocol";

// The SAME validation schema the web `connectBucket` server function uses (single source in
// @byos3/protocol); `.openapi(name)` only tags it as a named component in the generated spec.
// Importing `z` from @hono/zod-openapi extends zod with `.openapi`. See agents/docs/api.md.
export const ConnectBucketBody = ConnectBucketInput.openapi("ConnectBucketInput");

export const ConnectResultSchema = z
  .object({
    connectorId: z.string(),
    volumeId: z.string(),
    verified: z.boolean(),
    reason: z.string().optional(),
  })
  .openapi("ConnectResult");
