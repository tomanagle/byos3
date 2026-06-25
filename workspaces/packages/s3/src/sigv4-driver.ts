import { AwsClient } from "aws4fetch";
import { corsConfigXml } from "./cors";
import type {
  DriverConfig,
  ListPage,
  ObjectHead,
  PresignOptions,
  PresignedRequest,
  ProviderCapabilities,
  StorageDriver,
} from "./driver";

/** Encode a key for a URL path while preserving `/` separators. */
function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

/**
 * SigV4 driver (aws4fetch) used by every S3-compatible provider. Path-style addressing for
 * portability across AWS/R2/B2/Wasabi/MinIO. Credentials are captured privately by this closure
 * and never exposed (see code-architecture.md - sealed credential capability).
 */
export class SigV4Driver implements StorageDriver {
  readonly capabilities: ProviderCapabilities;
  readonly #aws: AwsClient;
  readonly #endpoint: string;
  readonly #bucket: string;

  constructor(config: DriverConfig, capabilities: ProviderCapabilities) {
    this.capabilities = capabilities;
    this.#aws = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secret,
      region: config.region || "auto",
      service: "s3",
    });
    this.#endpoint = config.endpoint.replace(/\/+$/, "");
    this.#bucket = config.bucket;
  }

  #objectUrl(key: string): string {
    return `${this.#endpoint}/${this.#bucket}/${encodeKey(key)}`;
  }

  async #presign(
    key: string,
    method: "GET" | "PUT",
    opts: PresignOptions,
  ): Promise<PresignedRequest> {
    const expiresIn = opts.expiresIn ?? 300;
    const u = new URL(this.#objectUrl(key));
    u.searchParams.set("X-Amz-Expires", String(expiresIn));
    const signed = await this.#aws.sign(u.toString(), { method, aws: { signQuery: true } });
    return {
      url: signed.url,
      method,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  presignGet(key: string, opts: PresignOptions = {}): Promise<PresignedRequest> {
    return this.#presign(key, "GET", opts);
  }

  presignPut(key: string, opts: PresignOptions = {}): Promise<PresignedRequest> {
    return this.#presign(key, "PUT", opts);
  }

  async headObject(key: string): Promise<ObjectHead | null> {
    const res = await this.#aws.fetch(this.#objectUrl(key), { method: "HEAD" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`headObject failed: ${res.status}`);
    return {
      size: Number(res.headers.get("content-length") ?? "0"),
      etag: res.headers.get("etag") ?? undefined,
    };
  }

  async deleteObject(key: string): Promise<void> {
    const res = await this.#aws.fetch(this.#objectUrl(key), { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`deleteObject failed: ${res.status}`);
  }

  async listObjects(prefix: string, opts: { maxKeys?: number } = {}): Promise<ListPage> {
    const u = new URL(`${this.#endpoint}/${this.#bucket}`);
    u.searchParams.set("list-type", "2");
    if (prefix) u.searchParams.set("prefix", prefix);
    u.searchParams.set("max-keys", String(opts.maxKeys ?? 1000));
    const res = await this.#aws.fetch(u.toString(), { method: "GET" });
    if (!res.ok) throw new Error(`listObjects failed: ${res.status}`);
    const xml = await res.text();
    const items = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((m) => ({
      key: /<Key>([\s\S]*?)<\/Key>/.exec(m[1])?.[1] ?? "",
      size: Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] ?? "0"),
    }));
    return { items, truncated: /<IsTruncated>true<\/IsTruncated>/.test(xml) };
  }

  async getCorsOrigins(): Promise<string[]> {
    const res = await this.#aws.fetch(`${this.#endpoint}/${this.#bucket}?cors`, { method: "GET" });
    if (res.status === 404) return []; // NoSuchCORSConfiguration
    if (!res.ok) throw new Error(`getCors failed: ${res.status}`);
    const xml = await res.text();
    return [...xml.matchAll(/<AllowedOrigin>([\s\S]*?)<\/AllowedOrigin>/g)].map((m) => m[1]);
  }

  async putCors(origins: string[]): Promise<void> {
    // SigV4 signs the payload (x-amz-content-sha256) for integrity - no Content-MD5 needed.
    const res = await this.#aws.fetch(`${this.#endpoint}/${this.#bucket}?cors`, {
      method: "PUT",
      body: corsConfigXml(origins),
      headers: { "content-type": "application/xml" },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`putCors failed: ${res.status}${detail ? ` ${detail.slice(0, 200)}` : ""}`);
    }
  }

  async probe(): Promise<{ ok: boolean; reason?: string }> {
    try {
      await this.listObjects("", { maxKeys: 1 });
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: String((err as Error)?.message ?? err) };
    }
  }
}
