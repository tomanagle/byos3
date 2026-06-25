import type { ProviderId } from "@byos3/protocol";

export type { ProviderId };

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  /** Short monospace badge. */
  tag: string;
  /** Literal Tailwind class (so the scanner keeps it) for the provider's identity color. */
  dot: string;
  text: string;
  hint: string;
  /** Pre-filled endpoint when the provider has a single canonical one (AWS S3). */
  defaultEndpoint?: string;
  /** Placeholder showing the endpoint shape when the user must supply it (e.g. R2 is account-specific). */
  endpointExample?: string;
  /** One-line instruction shown under the endpoint field: what to enter + where to find it. */
  endpointHelp?: string;
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: "s3",
    label: "Amazon S3",
    tag: "S3",
    dot: "bg-p-s3",
    text: "text-p-s3",
    hint: "aws · all regions",
    defaultEndpoint: "https://s3.us-east-1.amazonaws.com",
    endpointHelp: "Pre-filled for AWS. Set the Region to match your bucket if it isn't us-east-1.",
  },
  {
    id: "r2",
    label: "Cloudflare R2",
    tag: "R2",
    dot: "bg-p-r2",
    text: "text-p-r2",
    hint: "zero egress fees",
    endpointExample: "https://<account_id>.r2.cloudflarestorage.com",
    endpointHelp:
      "Your account's S3 API endpoint - Cloudflare dashboard → R2 → bucket → Settings → S3 API. Region stays auto.",
  },
  {
    id: "b2",
    label: "Backblaze B2",
    tag: "B2",
    dot: "bg-p-b2",
    text: "text-p-b2",
    hint: "low-cost archive",
    endpointExample: "https://s3.us-west-001.backblazeb2.com",
    endpointHelp: "Your bucket's Endpoint (Backblaze → Buckets), prefixed with https://s3.",
  },
  {
    id: "wasabi",
    label: "Wasabi",
    tag: "WS",
    dot: "bg-p-wasabi",
    text: "text-p-wasabi",
    hint: "hot cloud storage",
    endpointExample: "https://s3.us-east-1.wasabisys.com",
    endpointHelp: "Your region's service URL, e.g. s3.<region>.wasabisys.com.",
  },
  {
    id: "minio",
    label: "MinIO",
    tag: "MN",
    dot: "bg-p-minio",
    text: "text-p-minio",
    hint: "self-hosted",
    endpointExample: "http://localhost:9000",
    endpointHelp: "Your MinIO server's URL (scheme + host + port).",
  },
  {
    id: "custom",
    label: "Custom S3",
    tag: "S3",
    dot: "bg-p-custom",
    text: "text-p-custom",
    hint: "any s3-compatible endpoint",
    endpointExample: "https://s3.example.com",
    endpointHelp: "The full URL of your S3-compatible server.",
  },
];

export const PROVIDER: Record<ProviderId, ProviderMeta> = Object.fromEntries(
  PROVIDERS.map((p) => [p.id, p]),
) as Record<ProviderId, ProviderMeta>;

/** Stable provider color for a volume, derived from its label/bucket heuristically until the API
 * returns provider on the summary. Defaults to S3. */
export function providerFor(id: ProviderId | undefined): ProviderMeta {
  return (id && PROVIDER[id]) || PROVIDER.s3;
}
