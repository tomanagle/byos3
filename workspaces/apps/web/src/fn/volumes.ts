import { VolumeDownloadInput, VolumeUploadInput } from "@byos3/protocol";
import {
  downloadUrl as downloadUrlSvc,
  listVolumes as listVolumesSvc,
  uploadIntent as uploadIntentSvc,
} from "@byos3/services";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "#/lib/middleware";

// Thin server functions over @byos3/services - the session-authed counterpart to apps/api. Input is
// validated against the SHARED @byos3/protocol schemas; authorization happens inside the service.

export const listVolumes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    context.span.set({ fn: "listVolumes" });
    return listVolumesSvc(context.ctx);
  });

export const uploadIntent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(VolumeUploadInput)
  .handler(async ({ context, data }) => {
    context.span.set({ fn: "uploadIntent", "volume.id": data.volumeId });
    return uploadIntentSvc(context.ctx, data);
  });

export const downloadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(VolumeDownloadInput)
  .handler(async ({ context, data }) => {
    context.span.set({ fn: "downloadUrl", "volume.id": data.volumeId });
    return downloadUrlSvc(context.ctx, data);
  });
