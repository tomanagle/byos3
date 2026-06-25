---
name: credential-vault
description: >
  Seal and open user bucket credentials with @byos3/crypto's CredentialVault (WebCrypto envelope
  AES-GCM). Load when storing/reading a connector secret, handling CREDENTIAL_ENCRYPTION_KEY, or
  building a driver from a sealed credential. Covers seal/open/generateRootKey and the sealed-credential
  capability rule: the plaintext secret is unwrapped ONLY inside Connector.driver() and never exposed.
metadata:
  type: core
  library: '@byos3/crypto'
  library_version: '0.0.0'
sources:
  - 'tomanagle/byos3:agents/docs/secrets.md'
  - 'tomanagle/byos3:agents/docs/code-architecture.md'
---

# @byos3/crypto — CredentialVault

Connector secrets are **envelope-encrypted**: a fresh random data key per payload encrypts the
secret (AES-GCM); the platform root key (`CREDENTIAL_ENCRYPTION_KEY`) wraps that data key. Only the
ciphertext (`secretCipher`) is stored in D1. The plaintext exists in memory only transiently.

## Setup

```ts
import { CredentialVault } from "@byos3/crypto";

// The root key is the platform secret CREDENTIAL_ENCRYPTION_KEY (32 bytes, base64) — distinct from
// any user credential. Read it once at the composition root, never elsewhere.
const vault = new CredentialVault(env.CREDENTIAL_ENCRYPTION_KEY);

const cipher = await vault.seal("user-bucket-secret"); // → packed base64, store as connector.secretCipher
const secret = await vault.open(cipher);                // → plaintext, only where you must sign
```

`generateRootKey()` mints a new 32-byte base64 root key (for setup/rotation tooling).

## Core patterns

```ts
// Sealed-credential capability: the secret is opened ONLY inside Connector.driver() and captured
// privately by the driver closure — it's never a field, getter, or log on the entity.
async driver(bucket: string) {
  const secret = await this.deps.vault.open(this.record.secretCipher); // plaintext lives only here
  return this.deps.driverFactory({ /* …, */ secret, bucket });          // captured by the adapter
} // `secret` goes out of scope; nothing returns or logs it
```

## Common Mistakes

### CRITICAL Storing or returning the plaintext secret on the entity

Wrong:
```ts
class Connector { secret: string } // plaintext as data → leaks via logs, serialization, getters
```

Correct:
```ts
class Connector { /* only secretCipher */ async driver(bucket) { /* open() locally */ } }
```
A secret on the object is one `JSON.stringify`/log away from disclosure. The vault keeps it a sealed capability. Source: agents/docs/code-architecture.md.

### CRITICAL Logging the opened secret (or the presigned URL it signs)

Wrong:
```ts
const secret = await vault.open(cipher); logger.debug({ secret });
```

Correct:
```ts
const secret = await vault.open(cipher); // use to sign; never log. Log connector id / status only.
```
Source: agents/docs/secrets.md.

### HIGH Reusing the root key directly as the data key

Wrong:
```ts
encrypt(secret, env.CREDENTIAL_ENCRYPTION_KEY); // root key used per-payload, no envelope
```

Correct:
```ts
await vault.seal(secret); // random per-payload data key, wrapped by the root key (envelope)
```
Envelope encryption enables rotation and limits blast radius if one wrapped key leaks. Source: agents/docs/secrets.md.

### MEDIUM Committing CREDENTIAL_ENCRYPTION_KEY or leaving it in client code

Wrong:
```ts
const KEY = "8lt8yQR5…"; // hardcoded / shipped to the browser
```

Correct:
```ts
// .dev.vars locally (gitignored); wrangler secret / SOPS in prod. Server-only; never in a client bundle.
```
Source: agents/docs/secrets.md.
