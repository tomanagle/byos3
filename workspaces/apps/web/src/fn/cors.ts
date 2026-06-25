import { CorsSetupInput } from "@byos3/protocol";
import { setupCors as setupCorsSvc } from "@byos3/services";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "#/lib/middleware";

/**
 * Try to configure the bucket's CORS so the browser can transfer bytes directly to it; on success
 * the user does nothing, otherwise the result carries the exact policy for them to paste in. See
 * agents/docs/storage-byo-s3.md.
 */
export const setupCors = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(CorsSetupInput)
  .handler(async ({ context, data }) => {
    context.span.set({ fn: "setupCors", "volume.id": data.volumeId });
    const result = await setupCorsSvc(context.ctx, data);
    context.span.set({ "cors.applied": result.applied, "cors.supported": result.supported });
    return result;
  });
