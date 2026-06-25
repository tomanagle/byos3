import { CAPABILITIES } from "./capabilities";
import { SigV4Driver } from "./sigv4-driver";
import type { DriverConfig, StorageDriver } from "./driver";

/** Build a `StorageDriver` for a connector's config. All Tier-1 providers use the SigV4 driver. */
export function createDriver(config: DriverConfig): StorageDriver {
  const capabilities = CAPABILITIES[config.provider];
  if (!capabilities) throw new Error(`unknown provider: ${config.provider}`);
  return new SigV4Driver(config, capabilities);
}
