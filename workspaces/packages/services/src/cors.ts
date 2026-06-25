import type { CorsSetupResult, ProviderId } from "@byos3/protocol";
import { CAPABILITIES, corsPolicyJson } from "@byos3/s3";
import { assertCanVolume } from "./authz";
import type { ServiceContext } from "./context";

/** Where to paste the policy when we can't apply it automatically (provider dashboards). */
const CORS_DOCS: Partial<Record<ProviderId, string>> = {
  s3: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html",
  r2: "https://developers.cloudflare.com/r2/buckets/cors/",
  b2: "https://www.backblaze.com/docs/cloud-storage-cross-origin-resource-sharing-rules",
  wasabi: "https://docs.wasabi.com/docs/how-do-i-set-up-cors-on-a-bucket",
  minio: "https://min.io/docs/minio/linux/reference/minio-server/settings/api.html",
};

/**
 * Make browser→bucket transfers work by ensuring the bucket allows the app origin. We try to apply
 * the CORS policy with the connector's credential; if the provider doesn't expose the S3 CORS API or
 * the credential lacks permission, we return the exact policy JSON + a docs link so the user can
 * paste it into their dashboard. See storage-byo-s3.md.
 */
export async function setupCors(
  ctx: ServiceContext,
  args: { volumeId: string; origins: string[] },
): Promise<CorsSetupResult> {
  await assertCanVolume(ctx, args.volumeId, "file:create");
  const volume = await ctx.volumes.get(args.volumeId);
  const provider = volume.provider;
  const supported = CAPABILITIES[provider]?.corsViaS3Api ?? false;
  const policy = { provider, json: corsPolicyJson(args.origins), docsUrl: CORS_DOCS[provider] };

  if (!supported) {
    return {
      applied: false,
      supported: false,
      reason: `${provider} can't configure CORS over the S3 API - apply the policy below in your provider's settings.`,
      origins: args.origins,
      policy,
    };
  }

  try {
    await volume.putCors(args.origins);
    return { applied: true, supported: true, origins: args.origins, policy };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const permissionDenied = /\b40[13]\b|AccessDenied|Forbidden/i.test(message);
    return {
      applied: false,
      supported: true,
      reason: permissionDenied
        ? "This credential isn't allowed to change bucket settings - apply the policy below, or reconnect with an admin-scoped key."
        : `Couldn't apply CORS automatically (${message.slice(0, 120)}) - apply the policy below.`,
      origins: args.origins,
      policy,
    };
  }
}
