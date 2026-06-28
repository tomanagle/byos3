import { CAPABILITIES } from "./capabilities";
import { assertAllowedS3Endpoint, type EndpointPolicy } from "./endpoint";
import { SigV4Driver } from "./sigv4-driver";
import type { DriverConfig, StorageDriver } from "./driver";

/**
 * Build a `StorageDriver` for a connector's config. All Tier-1 providers use the SigV4 driver.
 * The endpoint is validated here - the universal choke point - so every server-side request the
 * driver makes (probe, list, CORS) is guarded against SSRF. `opts.allowPrivate` relaxes the policy
 * for self-hosted / dev deployments (see endpoint.ts).
 */
export function createDriver(config: DriverConfig, opts: EndpointPolicy = {}): StorageDriver {
  const capabilities = CAPABILITIES[config.provider];
  if (!capabilities) throw new Error(`unknown provider: ${config.provider}`);
  assertAllowedS3Endpoint(config.endpoint, opts);
  return new SigV4Driver(config, capabilities);
}
