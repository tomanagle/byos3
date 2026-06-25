import { ConnectBucketInput } from "@byos3/protocol";
import { connectBucket as connectBucketSvc } from "@byos3/services";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "#/lib/middleware";

export const connectBucket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(ConnectBucketInput)
  .handler(async ({ context, data }) => {
    context.span.set({ fn: "connectBucket", provider: data.provider });
    const result = await connectBucketSvc(context.ctx, data);
    context.span.set({
      "connector.id": result.connectorId,
      "volume.id": result.volumeId,
      "connector.verified": result.verified,
    });
    return result;
  });
