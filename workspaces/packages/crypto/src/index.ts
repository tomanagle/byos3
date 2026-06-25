/**
 * Envelope encryption for end-user bucket credentials (and other at-rest secrets).
 *
 * A fresh random **data key** encrypts each payload; the **root key**
 * (the `CREDENTIAL_ENCRYPTION_KEY` Worker secret) wraps that data key. Only ciphertext is stored
 * in D1; the root key never leaves the Worker. WebCrypto-only, so it runs on workerd, Bun, and the
 * browser. See agents/docs/secrets.md and agents/docs/code-architecture.md.
 */
const te = new TextEncoder();
const td = new TextDecoder();

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

const IV = 12; // AES-GCM nonce length
const WRAPPED = 48; // 32-byte data key + 16-byte GCM tag

export class CredentialVault {
  readonly #rootRaw: Uint8Array;

  constructor(rootKeyBase64: string) {
    this.#rootRaw = b64decode(rootKeyBase64);
    if (this.#rootRaw.length !== 32) {
      throw new Error("CREDENTIAL_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    }
  }

  #rootKey(usage: KeyUsage): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", this.#rootRaw, "AES-GCM", false, [usage]);
  }

  /** Encrypt a secret; returns an opaque base64 blob safe to store in D1. */
  async seal(plaintext: string): Promise<string> {
    const dataKeyRaw = crypto.getRandomValues(new Uint8Array(32));
    const dataKey = await crypto.subtle.importKey("raw", dataKeyRaw, "AES-GCM", false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(IV));
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, dataKey, te.encode(plaintext)),
    );
    const wkIv = crypto.getRandomValues(new Uint8Array(IV));
    const wrapped = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: wkIv },
        await this.#rootKey("encrypt"),
        dataKeyRaw,
      ),
    );
    // pack: [iv][wkIv][wrapped data key][ciphertext]
    const out = new Uint8Array(IV + IV + WRAPPED + ct.length);
    out.set(iv, 0);
    out.set(wkIv, IV);
    out.set(wrapped, IV + IV);
    out.set(ct, IV + IV + WRAPPED);
    return b64encode(out);
  }

  /** Decrypt a blob produced by `seal`. */
  async open(blob: string): Promise<string> {
    const buf = b64decode(blob);
    const iv = buf.subarray(0, IV);
    const wkIv = buf.subarray(IV, IV + IV);
    const wrapped = buf.subarray(IV + IV, IV + IV + WRAPPED);
    const ct = buf.subarray(IV + IV + WRAPPED);
    const dataKeyRaw = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: wkIv },
        await this.#rootKey("decrypt"),
        wrapped,
      ),
    );
    const dataKey = await crypto.subtle.importKey("raw", dataKeyRaw, "AES-GCM", false, ["decrypt"]);
    return td.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, dataKey, ct));
  }
}

/** Generate a fresh root key (base64) - used by `bun run secrets:setup`. */
export function generateRootKey(): string {
  return b64encode(crypto.getRandomValues(new Uint8Array(32)));
}
