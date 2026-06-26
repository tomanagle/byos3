# Storage - bring-your-own S3 (connectors & volumes)

Users supply their own object storage. We sign requests so clients transfer bytes **directly** to
the user's bucket. **Bytes never pass through the Worker** (sole exception: the AI indexer -
`ai-rag.md`).

> Per-provider credential setup, exact least-privilege permissions, endpoints, and quirks live in
> **[storage-providers.md](./storage-providers.md)**. What "S3-compatible" means and how we certify
> a provider against our required API subset live in **[s3-compatibility.md](./s3-compatibility.md)**.

## Connectors and volumes

- **Connector** = an encrypted provider credential (`connector` table). Provider ∈
  {`s3`, `r2`, `b2`}, plus endpoint/region and an access key pair. Account-scoped; a user can have
  many (e.g. an R2 token *and* a B2 application key).
- **Volume** = a **mountable drive** = connector + bucket + prefix + label/icon (`volume` table),
  mounted into a namespace. This is what the user sees and picks. Connecting an R2 bucket and a
  Backblaze bucket = two connectors → two volumes → two mounts.
- **Each file/folder node records its `volumeId`.** "Choose where to drop the file" = pick the
  target volume; the commit records it. Children default to the parent's volume.
- **Content addressing, dedup, and the chunk index are per-volume** (`<prefix>/chunks/<sha256>`
  within that bucket). The DO's missing-chunk check and GC are keyed by `volumeId`.
- **Presigning uses the connector creds of the node's volume.** Cross-volume moves copy chunks
  bucket-to-bucket (see `sync-engine.md`).

## Connecting & validating

On connect: store the credential encrypted, then validate with a cheap `HeadBucket` /
`ListObjectsV2(max-keys=1)`; persist `lastVerifiedAt`/`status`. Strongly steer users to a
**scoped credential** limited to **one dedicated bucket + prefix** (R2 scoped token / B2
application key restricted to a bucket+name-prefix / S3 IAM policy on `arn:.../bucket/prefix/*`),
not an account-root key. Volume count is a **plan limit** (`billing.md`).

## Credential handling

- Encrypt at rest with **envelope encryption** (`packages/crypto`): per-connector data key wrapped
  by the Worker secret `CREDENTIAL_ENCRYPTION_KEY`. Store only ciphertext in D1.
- Decrypt **only** in-Worker at signing time. **Never log** keys or presigned URLs. Never send
  credentials to the client.

## Presigned URLs

- The Worker signs **SigV4** with **aws4fetch** (the only viable approach on Workers - no AWS SDK).
- Mint **PUT** for upload, **GET** for download. (Browser **POST** form uploads are unsupported on
  R2 and B2 - always use PUT.)
- Treat URLs as **bearer tokens**: short TTL (minutes), pin `Content-Type` (and `Content-Length`
  where possible), scope to one exact key.

## Multipart (large files)

`CreateMultipartUpload` → presign each `UploadPart` → client PUTs parts in parallel, collecting
per-part ETags → `CompleteMultipartUpload` with the ETag list. Limits (all three providers):
min part **5 MB**, max **10,000 parts**, max part **5 GB/GiB**. Always set lifecycle/abort logic
for incomplete uploads (R2 auto-aborts after 7 days; others bill orphaned parts).

## Provider compatibility (target the lowest common denominator)

Reliable subset: SigV4, `PutObject`/`GetObject`/`HeadObject`/`DeleteObject(s)`, multipart,
`ListObjectsV2`, conditional `If-Match`/ETag, CORS.

| Concern | AWS S3 | Cloudflare R2 | Backblaze B2 |
|---|---|---|---|
| Region | real region | **always `auto`** | single per account |
| Browser POST upload | yes | **no** | **no** |
| Versioning | opt-in | unimplemented | **on by default** (deletes drop latest version only) |
| ACLs / tagging | yes | ignored / unimplemented | limited |
| Egress | ~$0.09/GB | **$0 (free)** | free to 3× stored/mo, then ~$0.01/GB |
| Max single object | 50 TB | ~4.995 TB | 10 TB |

**Do not treat ETag as a content hash** - for multipart it's `md5(part md5s)-N`, not the object
hash. Compute **SHA-256 client-side** and keep it as our integrity + dedup source of truth (in
the `version` row and `chunk_index`).

## CORS

Required on **every** user bucket for browser transfer. Set `AllowedOrigins` (your app origin, not
`*` in prod), `AllowedMethods: [GET, PUT, HEAD]`, **`AllowedHeaders: ["*"]`** (a presigned PUT always
preflights, and the File body carries a Content-Type, so a missing `AllowedHeaders` makes the
preflight fail with "No 'Access-Control-Allow-Origin' header" - the #1 first-connect gotcha), and
**`ExposeHeaders: [ETag]`** (the browser must read ETag to complete multipart).

**Implementation.** The canonical rule lives once in `@byos3/s3` (`corsConfigXml` for `PutBucketCors`,
`corsPolicyJson` for display). On connect the web app calls the `setupCors` server fn
(`services/setupCors`): if the provider exposes the S3 CORS API (`capabilities.corsViaS3Api`) it
attempts `PutBucketCors` with the connector credential; on success the user does nothing. If the
provider can't (Wasabi auto-wildcard, MinIO env var) or the credential lacks permission (e.g. an R2
object-RW token 403s - R2 needs an admin/edit-scoped token), the result carries the exact policy JSON
+ a provider docs link, which the UI shows for copy-paste (`components/app/cors-setup.tsx`).

## Garbage collection (per volume)

Chunks are content-addressed and refcounted (`chunk_index`). When versions age out past the plan's
history window, decrement refcounts; a **Workflow** mark-sweeps chunks at refcount 0 and deletes
them from that volume's bucket. GC must be **idempotent** and conservative - never delete a chunk
still referenced by any live version. Run per volume.

**Dedup/GC race (Dropbox's classic bug - `foundational-considerations.md` §7):** a chunk can be
GC'd at the moment a new commit dedups against it. Guard with two rules: (1) the **journal is the
source of truth for liveness** and deletion **lags reference-drop by a grace period**; (2) **commit
re-verifies chunk existence** (HEAD) - if a deduped chunk is missing (GC race *or* the user deleted
it out-of-band), the client re-uploads it. The user's bucket is **mutable and untrusted**: never
assume a referenced chunk still exists; verify on read, surface a "needs re-upload" state, and let
the reconciliation Workflow detect drift.

## Egress/cost guidance (surface to users)

Direct-from-bucket download is exactly right because **the user pays their own egress** - proxying
would dump that cost on us. Download-heavy → R2 (zero egress); cold/archival → B2 (cheapest
storage). R2/B2 also bill per operation, so batch and prefer paginated `ListObjectsV2` over chatty
calls.
