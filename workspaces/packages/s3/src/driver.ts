/**
 * The provider-agnostic storage port. Every S3-compatible provider is reduced to this interface;
 * differences live in `ProviderCapabilities` data, not in scattered conditionals.
 * See agents/docs/code-architecture.md and storage-byo-s3.md.
 */
export type ProviderId = "s3" | "r2" | "b2" | "wasabi" | "minio" | "custom";

export interface ProviderCapabilities {
  /** Can CORS be set via the S3 `PutBucketCors` API (vs out-of-band / automatic)? */
  corsViaS3Api: boolean;
  /** Can a credential be IAM-scoped to a key prefix? */
  prefixEnforceable: boolean;
  /** Address the bucket in the path (vs virtual-host). We use path-style universally for now. */
  forcePathStyle: boolean;
  /** "real" bucket region, "auto" (R2), or "any" (ignored by the provider). */
  region: "real" | "auto" | "any";
  /** Browser-direct transfer impossible (e.g. no CORS) → bytes must be proxied. */
  requiresProxy: boolean;
  /** Deletes insert a delete-marker rather than purging (B2). */
  versionedByDefault: boolean;
  recommendedPartSizeBytes: number;
}

export interface DriverConfig {
  provider: ProviderId;
  /** Region/account endpoint WITHOUT the bucket, e.g. `https://<acct>.r2.cloudflarestorage.com`. */
  endpoint: string;
  region: string;
  accessKeyId: string;
  secret: string;
  bucket: string;
}

/** Seconds until a presigned URL expires (default 300; max 7 days). */
export interface PresignOptions {
  expiresIn?: number;
}

export interface PresignedRequest {
  url: string;
  method: "GET" | "PUT";
  headers?: Record<string, string>;
  expiresAt: string;
}

export interface ObjectHead {
  size: number;
  etag?: string;
}

export interface ListItem {
  key: string;
  size: number;
}

export interface ListPage {
  items: ListItem[];
  truncated: boolean;
}

export interface StorageDriver {
  readonly capabilities: ProviderCapabilities;
  /** Cheap connectivity/permission check - `ListObjectsV2(maxKeys=1)`. */
  probe(): Promise<{ ok: boolean; reason?: string }>;
  presignGet(key: string, opts?: PresignOptions): Promise<PresignedRequest>;
  presignPut(key: string, opts?: PresignOptions): Promise<PresignedRequest>;
  headObject(key: string): Promise<ObjectHead | null>;
  deleteObject(key: string): Promise<void>;
  listObjects(prefix: string, opts?: { maxKeys?: number }): Promise<ListPage>;
  /** Read the bucket's currently-allowed CORS origins (empty if none / not configured). */
  getCorsOrigins(): Promise<string[]>;
  /** Apply byos3's CORS rule allowing `origins` (`PutBucketCors`). Throws if denied/unsupported. */
  putCors(origins: string[]): Promise<void>;
  // Multipart upload lands in a later phase (storage-byo-s3.md).
}
