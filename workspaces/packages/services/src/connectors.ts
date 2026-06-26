import { AppError, Connector, createId } from "@byos3/core";
import { ConnectorRecord, VolumeRecord, type ConnectBucketInput } from "@byos3/protocol";
import type { ServiceContext } from "./context";
import { assertWithinLimit, resolveEntitlement } from "./entitlement";

export interface ConnectResult {
  connectorId: string;
  volumeId: string;
  verified: boolean;
  reason?: string;
}

/**
 * Connect a bucket the caller owns: seal the secret, best-effort probe, persist a connector + a
 * default volume, and seed the owner as the `full` member of both (resource-level access - rbac.md).
 * Connecting your own credential needs no prior authorization; the `namespaceId` is the volume's
 * sync/DO home (storage), not its access boundary. Shared by the web (session) and api (key)
 * transports - for an org-owned key the namespace is the key's own, and `principal.userId` is the
 * namespace owner (set by the api composition root), so the resource is attributed to them.
 */
export async function connectBucket(
  ctx: ServiceContext,
  input: ConnectBucketInput,
): Promise<ConnectResult> {
  const namespaceId =
    ctx.principal.keyNamespaceId ??
    (await ctx.memberships.primaryNamespaceId(ctx.principal.userId));
  if (!namespaceId) throw new AppError("forbidden", "no namespace");

  // Entitlement gate: a namespace may mount up to its plan's volume cap (free = 1, paid = unlimited).
  const ent = await resolveEntitlement(ctx, namespaceId);
  const existing = await ctx.volumes.listByNamespace(namespaceId);
  assertWithinLimit(existing.length, ent.limits.volumes, "volume");

  const secretCipher = await ctx.vault.seal(input.secret);
  const now = Date.now();
  const draft = ConnectorRecord.parse({
    id: createId("conn"),
    ownerUserId: ctx.principal.userId,
    provider: input.provider,
    endpoint: input.endpoint,
    region: input.region,
    accessKeyId: input.accessKeyId,
    secretCipher,
    label: input.label ?? input.provider,
    status: "unverified",
    createdAt: now,
  });

  // Best-effort connectivity check - never blocks connecting (the bucket may be empty/new).
  let verified = false;
  let reason: string | undefined;
  try {
    const probe = await new Connector(draft, {
      vault: ctx.vault,
      driverFactory: ctx.driverFactory,
    }).verify(input.bucket);
    verified = probe.ok;
    reason = probe.reason;
  } catch (err) {
    reason = String((err as Error)?.message ?? err);
  }

  const connector = { ...draft, status: verified ? "active" : "unverified" };
  await ctx.connectors.insert(connector);

  const volume = VolumeRecord.parse({
    id: createId("vol"),
    connectorId: connector.id,
    namespaceId,
    bucket: input.bucket,
    prefix: input.prefix,
    label: input.label ?? input.bucket,
    status: "active",
    createdAt: now,
  });
  await ctx.volumes.insert(volume);

  // The owner is a `full` member of both - the seed for resource-level sharing.
  await ctx.access.addConnectorMember(connector.id, ctx.principal.userId, "full");
  await ctx.access.addVolumeMember(volume.id, ctx.principal.userId, "full");

  return { connectorId: connector.id, volumeId: volume.id, verified, reason };
}
