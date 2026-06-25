import { VolumeMembersInput, VolumeShareInput, VolumeUnshareInput } from "@byos3/protocol";
import {
  listVolumeMembers as listMembersSvc,
  shareVolume as shareVolumeSvc,
  unshareVolume as unshareVolumeSvc,
} from "@byos3/services";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "#/lib/middleware";

export const shareVolume = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(VolumeShareInput)
  .handler(async ({ context, data }) => {
    context.span.set({ fn: "shareVolume", "volume.id": data.volumeId, role: data.role });
    return shareVolumeSvc(context.ctx, data);
  });

export const listVolumeMembers = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(VolumeMembersInput)
  .handler(async ({ context, data }) => {
    context.span.set({ fn: "listVolumeMembers", "volume.id": data.volumeId });
    return listMembersSvc(context.ctx, data);
  });

export const unshareVolume = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(VolumeUnshareInput)
  .handler(async ({ context, data }) => {
    context.span.set({ fn: "unshareVolume", "volume.id": data.volumeId });
    await unshareVolumeSvc(context.ctx, data);
    return { ok: true };
  });
