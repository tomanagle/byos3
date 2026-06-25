import { z } from "zod";

/**
 * S3-compatible providers (see agents/docs/storage-providers.md). The named ones carry provider
 * quirks/defaults; `custom` is the escape hatch - any S3-compatible server where the user supplies
 * their own endpoint + credentials (used for self-hosted servers and the MinIO e2e fake bucket).
 */
export const ProviderId = z.enum(["s3", "r2", "b2", "wasabi", "minio", "custom"]);
export type ProviderId = z.infer<typeof ProviderId>;

/** A stored, encrypted provider credential (D1 `connector` table). `secretCipher` is vault-sealed. */
export const ConnectorRecord = z.object({
  id: z.string(),
  ownerUserId: z.string(),
  provider: ProviderId,
  endpoint: z.string(),
  region: z.string(),
  accessKeyId: z.string(),
  secretCipher: z.string(),
  label: z.string(),
  status: z.enum(["active", "unverified", "invalid", "revoked"]),
  createdAt: z.number(),
});
export type ConnectorRecord = z.infer<typeof ConnectorRecord>;

/** A mountable drive = connector + bucket + prefix (D1 `volume` table). */
export const VolumeRecord = z.object({
  id: z.string(),
  connectorId: z.string(),
  namespaceId: z.string(),
  bucket: z.string(),
  prefix: z.string(),
  label: z.string(),
  status: z.enum(["active", "invalid"]),
  createdAt: z.number(),
});
export type VolumeRecord = z.infer<typeof VolumeRecord>;

/**
 * The S3 endpoint, normalized: we accept a bare host (e.g. `acct.r2.cloudflarestorage.com`) and
 * prepend `https://` so a scheme-less paste still validates as a URL. Required for every provider
 * except AWS S3 (which the web app pre-fills) - most notably R2, whose endpoint encodes the account
 * id and so can never be defaulted. See agents/docs/storage-providers.md.
 */
export const S3Endpoint = z
  .string()
  .trim()
  .min(1, "endpoint is required")
  .transform((v) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`))
  .pipe(z.url());

/** API input - connect a bucket (`POST /api/v1/connectors`). */
export const ConnectBucketInput = z.object({
  provider: ProviderId,
  endpoint: S3Endpoint,
  region: z.string().default("auto"),
  accessKeyId: z.string().min(1),
  secret: z.string().min(1),
  bucket: z.string().min(1).max(255),
  prefix: z.string().default("byos3/"),
  label: z.string().max(120).optional(),
});
export type ConnectBucketInput = z.infer<typeof ConnectBucketInput>;

/** A lowercase sha256 hex digest (a content-addressed chunk id). */
export const Sha256 = z.string().regex(/^[a-f0-9]{64}$/, "expected a lowercase sha256 hex digest");

/** API input - get a presigned PUT for a content-addressed chunk (body of the apps/api route). */
export const UploadIntentInput = z.object({
  hash: Sha256,
  expiresIn: z.number().int().min(30).max(3600).optional(),
});
export type UploadIntentInput = z.infer<typeof UploadIntentInput>;

// ── Web server-function inputs ──────────────────────────────────────────────
// The apps/api routes carry `volumeId` in the path; web server functions take a single object, so
// these compose the volume id into the shared field schemas above. Validation source for BOTH
// transports lives here (see agents/docs/api.md).

/** Presigned-PUT request for a specific volume (web `uploadIntent` server fn). */
export const VolumeUploadInput = z.object({
  volumeId: z.string().min(1),
  ...UploadIntentInput.shape,
});
export type VolumeUploadInput = z.infer<typeof VolumeUploadInput>;

/** Presigned-GET request for a specific volume (web `downloadUrl` server fn). */
export const VolumeDownloadInput = z.object({
  volumeId: z.string().min(1),
  hash: Sha256,
});
export type VolumeDownloadInput = z.infer<typeof VolumeDownloadInput>;

/** List objects under a volume's prefix (web `listObjects` server fn). */
export const VolumeListObjectsInput = z.object({
  volumeId: z.string().min(1),
  prefix: z.string().optional(),
});
export type VolumeListObjectsInput = z.infer<typeof VolumeListObjectsInput>;

/** A named object in a volume (presigned PUT/GET by human key - the interim, pre-journal file model). */
export const VolumeObjectKeyInput = z.object({
  volumeId: z.string().min(1),
  key: z.string().min(1).max(1024),
});
export type VolumeObjectKeyInput = z.infer<typeof VolumeObjectKeyInput>;

/** Mint a scoped API key for the signed-in user (web `createApiKey` server fn). */
export const ApiKeyCreateInput = z.object({
  name: z.string().min(1).max(120).optional(),
  permissions: z.record(z.string(), z.array(z.string())).optional(),
  expiresIn: z.number().int().positive().optional(),
});
export type ApiKeyCreateInput = z.infer<typeof ApiKeyCreateInput>;

// ── Resource sharing inputs ──────────────────────────────────────────────────
// Wire contract for inviting users to a volume. `ShareRole` mirrors core's `RESOURCE_ROLES`
// (full | read_write | read_only) - core is the authz source of truth, this is the transport copy
// (protocol is the lowest layer and cannot import core). The service still re-validates via core.

export const ShareRole = z.enum(["full", "read_write", "read_only"]);
export type ShareRole = z.infer<typeof ShareRole>;

/** Invite a user (by email) to a volume with a role (web `shareVolume` server fn). */
export const VolumeShareInput = z.object({
  volumeId: z.string().min(1),
  email: z.email(),
  role: ShareRole,
});
export type VolumeShareInput = z.infer<typeof VolumeShareInput>;

/** List a volume's members (web `listVolumeMembers` server fn). */
export const VolumeMembersInput = z.object({ volumeId: z.string().min(1) });
export type VolumeMembersInput = z.infer<typeof VolumeMembersInput>;

/** Revoke a user's access to a volume (web `unshareVolume` server fn). */
export const VolumeUnshareInput = z.object({
  volumeId: z.string().min(1),
  userId: z.string().min(1),
});
export type VolumeUnshareInput = z.infer<typeof VolumeUnshareInput>;

// ── CORS setup ───────────────────────────────────────────────────────────────
// Browser→bucket direct transfers need the bucket to allow the app origin. We try to apply the CORS
// rule with the connector's credential; if that's not possible (provider/permission), we hand the
// user the exact policy to paste into their provider's dashboard. See storage-byo-s3.md.

/** Apply CORS to a volume's bucket, allowing these app origins (web `setupCors` server fn). */
export const CorsSetupInput = z.object({
  volumeId: z.string().min(1),
  origins: z.array(z.url()).min(1),
});
export type CorsSetupInput = z.infer<typeof CorsSetupInput>;

export const CorsSetupResult = z.object({
  /** We successfully applied the policy on the bucket - uploads will work, nothing for the user to do. */
  applied: z.boolean(),
  /** Whether this provider supports configuring CORS via the S3 API at all (informs the message). */
  supported: z.boolean(),
  /** Why auto-apply didn't happen (permission, unsupported, error) - shown when `applied` is false. */
  reason: z.string().optional(),
  /** The origins the policy allows. */
  origins: z.array(z.string()),
  /** Copy-paste fallback: the exact CORS policy JSON + where to apply it. */
  policy: z.object({
    provider: ProviderId,
    json: z.string(),
    docsUrl: z.string().optional(),
  }),
});
export type CorsSetupResult = z.infer<typeof CorsSetupResult>;
