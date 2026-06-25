import type { ProviderCapabilities, ProviderId } from "./driver";

const MB = 1024 * 1024;

const base: ProviderCapabilities = {
  corsViaS3Api: true,
  prefixEnforceable: true,
  forcePathStyle: true,
  region: "real",
  requiresProxy: false,
  versionedByDefault: false,
  recommendedPartSizeBytes: 8 * MB,
};

// Tier-1 providers. The full matrix + per-provider quirks live in agents/docs/storage-providers.md.
export const CAPABILITIES: Record<ProviderId, ProviderCapabilities> = {
  s3: { ...base, region: "real" },
  // R2 exposes the S3 PutBucketCors API, but only an admin/edit-scoped token may use it - object-RW
  // tokens 403. We attempt it and fall back to showing the policy when the credential can't.
  r2: { ...base, region: "auto" },
  b2: { ...base, region: "real", versionedByDefault: true },
  wasabi: { ...base, region: "real", corsViaS3Api: false },
  minio: { ...base, region: "any", corsViaS3Api: false },
  // Any S3-compatible server the user points us at. Make no assumptions: region is ignored, and we
  // can't assume CORS is configurable via the S3 API (the operator may set it out-of-band).
  custom: { ...base, region: "any", corsViaS3Api: false },
};
