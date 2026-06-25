import { z } from "@hono/zod-openapi";
import { Sha256, UploadIntentInput } from "@byos3/protocol";

export const VolumeSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    bucket: z.string(),
    prefix: z.string(),
    provider: z.enum(["s3", "r2", "b2", "wasabi", "minio"]).optional(),
  })
  .openapi("Volume");

export const PresignedRequestSchema = z
  .object({
    url: z.string(),
    method: z.enum(["GET", "PUT"]),
    headers: z.record(z.string(), z.string()).optional(),
    expiresAt: z.string(),
  })
  .openapi("PresignedRequest");

// Shared with the web `uploadIntent` server function (single source in @byos3/protocol).
export const UploadIntentBody = UploadIntentInput.openapi("UploadIntentInput");

export const DownloadQuery = z.object({ hash: Sha256 });

export const VolumeIdParam = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" } }),
});
