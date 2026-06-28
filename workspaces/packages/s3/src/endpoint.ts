/**
 * SSRF guard for user-supplied S3 endpoints. The server makes metadata requests (probe on connect,
 * CORS read/write, object listing) to whatever endpoint a connector specifies, so an unconstrained
 * endpoint lets an authenticated user point our infrastructure at arbitrary hosts.
 *
 * Policy:
 *   - Cloud instance-metadata addresses are ALWAYS rejected - no S3 endpoint lives there, and on a
 *     self-hosted VM they hand out the host's cloud credentials (IMDS). Zero false positives.
 *   - Otherwise, by default we require https and reject loopback / private / link-local hosts (the
 *     hosted, multi-tenant posture). `allowPrivate` relaxes that for self-hosters and local dev who
 *     legitimately point at an internal MinIO / custom S3 (set ALLOW_PRIVATE_S3_ENDPOINTS=true).
 *
 * Note: this blocks IP literals + obvious internal names. It cannot fully stop DNS rebinding (a public
 * name that resolves to a private address) - workerd's fetch doesn't expose resolve-and-pin - but on
 * Cloudflare Workers a rebind to an internal address isn't routable anyway. See agents/docs/storage-byo-s3.md.
 */

const METADATA_HOSTS = new Set([
  "169.254.169.254", // AWS / Azure / OpenStack / DigitalOcean IMDS
  "169.254.170.2", // AWS ECS task metadata
  "metadata", // common internal alias
  "metadata.google.internal", // GCP metadata
  "fd00:ec2::254", // AWS IMDS over IPv6
]);

export interface EndpointPolicy {
  /** Permit http + loopback/private/link-local hosts (self-hosted MinIO / dev). IMDS stays blocked. */
  allowPrivate?: boolean;
}

function parseIpv4(host: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const o = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as const;
  return o.every((n) => n <= 255) ? [...o] : null;
}

function isPrivateOrLoopback(rawHost: string): boolean {
  const host = rawHost.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;

  const v4 = parseIpv4(host);
  if (v4) {
    const [a, b] = v4;
    return (
      a === 0 || // 0.0.0.0/8 "this host"
      a === 127 || // loopback
      a === 10 || // private
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 168) || // private
      (a === 169 && b === 254) || // link-local (incl. IMDS range)
      (a === 100 && b >= 64 && b <= 127) // CGNAT (carrier-grade NAT)
    );
  }

  if (host === "::1" || host === "::") return true; // IPv6 loopback / unspecified
  if (host.startsWith("fe80:")) return true; // IPv6 link-local
  if (host.startsWith("fc") || host.startsWith("fd")) return true; // IPv6 unique-local
  if (host.startsWith("::ffff:")) return isPrivateOrLoopback(host.slice("::ffff:".length)); // mapped v4
  return false;
}

/** Throws if `endpoint` is not allowed under `policy`. Run before any server-side fetch to it. */
export function assertAllowedS3Endpoint(endpoint: string, policy: EndpointPolicy = {}): void {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("endpoint is not a valid URL");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (METADATA_HOSTS.has(host)) throw new Error("endpoint host is not allowed");
  if (policy.allowPrivate) return;

  if (url.protocol !== "https:") throw new Error("endpoint must use https");
  if (isPrivateOrLoopback(host)) throw new Error("endpoint host is not allowed");
}
