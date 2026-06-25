import type { ProviderId, VolumeRecord } from "@byos3/protocol";
import type { PresignedRequest, PresignOptions } from "@byos3/s3";
import type { Connector } from "./connector";
import { AppError } from "./errors";

export interface VolumeDeps {
  connector: Connector;
}

/**
 * A mountable drive. Domain methods are pre-scoped to the volume's prefix; keys cannot escape it.
 * Server-only (presigning needs the connector's sealed credential). See code-architecture.md.
 */
export class Volume {
  constructor(
    private readonly record: VolumeRecord,
    private readonly deps: VolumeDeps,
  ) {}

  get id(): string {
    return this.record.id;
  }
  get namespaceId(): string {
    return this.record.namespaceId;
  }
  get bucket(): string {
    return this.record.bucket;
  }
  get provider(): ProviderId {
    return this.deps.connector.provider;
  }

  /** Content-addressed object key for a chunk, under this volume's prefix. */
  chunkKey(sha256: string): string {
    return `${this.#prefix()}chunks/${sha256}`;
  }

  async presignGet(key: string, opts: PresignOptions = {}): Promise<PresignedRequest> {
    const driver = await this.deps.connector.driver(this.record.bucket);
    return driver.presignGet(this.#scoped(key), { expiresIn: 300, ...opts });
  }

  async presignPut(key: string, opts: PresignOptions = {}): Promise<PresignedRequest> {
    const driver = await this.deps.connector.driver(this.record.bucket);
    return driver.presignPut(this.#scoped(key), { expiresIn: 300, ...opts });
  }

  /** List objects under the volume's prefix (optionally a sub-prefix). Keys are bucket-absolute. */
  async list(prefix = ""): Promise<{ items: { key: string; size: number }[]; truncated: boolean }> {
    const driver = await this.deps.connector.driver(this.record.bucket);
    return driver.listObjects(this.#scoped(prefix));
  }

  /** Bucket-level CORS: read currently-allowed origins. CORS is bucket-wide (not prefix-scoped). */
  async corsOrigins(): Promise<string[]> {
    const driver = await this.deps.connector.driver(this.record.bucket);
    return driver.getCorsOrigins();
  }

  /** Apply byos3's CORS rule allowing `origins`. Throws if the credential/provider can't (caller
   * falls back to showing the user the policy to paste in). */
  async putCors(origins: string[]): Promise<void> {
    const driver = await this.deps.connector.driver(this.record.bucket);
    await driver.putCors(origins);
  }

  /** The volume's bucket prefix (always trailing-slashed) - strip it to show keys relatively. */
  get prefix(): string {
    return this.#prefix();
  }

  #prefix(): string {
    return this.record.prefix.endsWith("/") ? this.record.prefix : `${this.record.prefix}/`;
  }

  /** Force every key under the volume's prefix; reject traversal. */
  #scoped(key: string): string {
    if (key.includes("..")) throw new AppError("scope_violation");
    const full = key.startsWith(this.#prefix()) ? key : `${this.#prefix()}${key}`;
    if (!full.startsWith(this.#prefix())) throw new AppError("scope_violation");
    return full;
  }
}
