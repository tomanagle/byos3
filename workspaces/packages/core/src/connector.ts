import type { ConnectorRecord, ProviderId } from "@byos3/protocol";
import type { StorageDriver } from "@byos3/s3";
import type { DriverFactory, Vault } from "./ports";

export interface ConnectorDeps {
  vault: Vault;
  driverFactory: DriverFactory;
}

/**
 * A connected provider credential. `driver()` unwraps the secret in-memory and seals it inside the
 * driver closure - the secret is never a field, getter, or log on this entity.
 * See agents/docs/code-architecture.md.
 */
export class Connector {
  constructor(
    private readonly record: ConnectorRecord,
    private readonly deps: ConnectorDeps,
  ) {}

  get id(): string {
    return this.record.id;
  }
  get provider(): ProviderId {
    return this.record.provider;
  }
  get ownerUserId(): string {
    return this.record.ownerUserId;
  }

  /** Build a storage driver bound to `bucket`, with the secret unwrapped only here. */
  async driver(bucket: string): Promise<StorageDriver> {
    const secret = await this.deps.vault.open(this.record.secretCipher);
    return this.deps.driverFactory({
      provider: this.record.provider,
      endpoint: this.record.endpoint,
      region: this.record.region,
      accessKeyId: this.record.accessKeyId,
      secret,
      bucket,
    });
  }

  /** Validate connectivity/permissions against a bucket. */
  async verify(bucket: string): Promise<{ ok: boolean; reason?: string }> {
    const driver = await this.driver(bucket);
    return driver.probe();
  }
}
