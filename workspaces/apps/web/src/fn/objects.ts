import { VolumeListObjectsInput, VolumeObjectKeyInput } from "@byos3/protocol";
import {
  listObjects as listObjectsSvc,
  objectUrl as objectUrlSvc,
  putObjectIntent as putObjectIntentSvc,
} from "@byos3/services";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "#/lib/middleware";

export const listObjects = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(VolumeListObjectsInput)
  .handler(async ({ context, data }) => {
    context.span.set({ fn: "listObjects", "volume.id": data.volumeId });
    return listObjectsSvc(context.ctx, data);
  });

export const putObjectIntent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(VolumeObjectKeyInput)
  .handler(async ({ context, data }) => {
    context.span.set({ fn: "putObjectIntent", "volume.id": data.volumeId });
    return putObjectIntentSvc(context.ctx, data);
  });

export const objectUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(VolumeObjectKeyInput)
  .handler(async ({ context, data }) => {
    context.span.set({ fn: "objectUrl", "volume.id": data.volumeId });
    return objectUrlSvc(context.ctx, data);
  });
