import type { ProviderId } from "@byos3/protocol";
import type { PresignedRequest } from "@byos3/s3";
import { assertCanVolume } from "./authz";
import type { ServiceContext } from "./context";

/** Presigned PUT for a content-addressed chunk (the client uploads direct to the bucket). */
export async function uploadIntent(
  ctx: ServiceContext,
  args: { volumeId: string; hash: string; expiresIn?: number },
): Promise<PresignedRequest> {
  await assertCanVolume(ctx, args.volumeId, "file:create");
  const volume = await ctx.volumes.get(args.volumeId);
  return volume.presignPut(volume.chunkKey(args.hash), { expiresIn: args.expiresIn ?? 300 });
}

/** Presigned GET for a content-addressed chunk. */
export async function downloadUrl(
  ctx: ServiceContext,
  args: { volumeId: string; hash: string },
): Promise<PresignedRequest> {
  await assertCanVolume(ctx, args.volumeId, "file:read");
  const volume = await ctx.volumes.get(args.volumeId);
  return volume.presignGet(volume.chunkKey(args.hash));
}

/** Presigned PUT for a NAMED object (interim file model - client uploads direct to the bucket). */
export async function putObjectIntent(
  ctx: ServiceContext,
  args: { volumeId: string; key: string },
): Promise<PresignedRequest> {
  await assertCanVolume(ctx, args.volumeId, "file:create");
  const volume = await ctx.volumes.get(args.volumeId);
  return volume.presignPut(args.key);
}

/** Presigned GET for a NAMED object. */
export async function objectUrl(
  ctx: ServiceContext,
  args: { volumeId: string; key: string },
): Promise<PresignedRequest> {
  await assertCanVolume(ctx, args.volumeId, "file:read");
  const volume = await ctx.volumes.get(args.volumeId);
  return volume.presignGet(args.key);
}

export interface VolumeSummary {
  id: string;
  label: string;
  bucket: string;
  prefix: string;
  provider?: ProviderId;
  /** the caller's role on this volume (full | read_write | read_only) */
  role?: string;
}

/** List the volumes the caller can access (owned or shared with them), with provider + their role. */
export async function listVolumes(ctx: ServiceContext): Promise<VolumeSummary[]> {
  const records = await ctx.access.listAccessibleVolumes(ctx.principal.userId);
  return Promise.all(
    records.map(async (r) => {
      let provider: ProviderId | undefined;
      try {
        provider = (await ctx.connectors.get(r.connectorId)).provider;
      } catch {
        // connector removed - leave provider undefined; the UI falls back to a neutral identity.
      }
      const role = (await ctx.access.volumeRoleFor(ctx.principal.userId, r.id)) ?? undefined;
      return { id: r.id, label: r.label, bucket: r.bucket, prefix: r.prefix, provider, role };
    }),
  );
}

export interface ListedObject {
  /** Key relative to the volume's prefix (the prefix is stripped for display). */
  key: string;
  size: number;
}

/** Browse objects under a volume's prefix (reads directly from the user's bucket). */
export async function listObjects(
  ctx: ServiceContext,
  args: { volumeId: string; prefix?: string },
): Promise<{ items: ListedObject[]; truncated: boolean }> {
  await assertCanVolume(ctx, args.volumeId, "file:read");
  const volume = await ctx.volumes.get(args.volumeId);
  const page = await volume.list(args.prefix ?? "");
  const base = volume.prefix;
  return {
    items: page.items.map((i) => ({
      key: i.key.startsWith(base) ? i.key.slice(base.length) : i.key,
      size: i.size,
    })),
    truncated: page.truncated,
  };
}
