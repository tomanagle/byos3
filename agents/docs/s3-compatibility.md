# S3 compatibility - what it means & how we verify it

Required reading before working on `packages/s3` or any provider integration. Explains what
"S3-compatible" actually means, the exact S3 subset **byos3** depends on, and how we test our
client and certify a provider. See `storage-providers.md` for per-provider specifics.

## What "S3-compatible" means

**S3 is an HTTP REST API, not a library.** An S3 request is an HTTP verb against a bucket/object
URL; request and response bodies (and errors) are **XML**; authentication is an `Authorization`
header (or presigned query string) computed with **AWS Signature Version 4 (SigV4)** over a
canonicalized request. The AWS SDKs are just clients that speak this wire protocol.

A provider is **"S3-compatible"** when it re-implements that same HTTP surface on its own
endpoint, so an AWS SDK / SigV4 signer works against it unchanged. They copy the *protocol*, not
AWS's internals. The moving parts that define compatibility:

- **Endpoint & addressing** - *virtual-hosted* (`https://BUCKET.host/key`) vs *path-style*
  (`https://host/BUCKET/key`). Some providers require path-style (MinIO, GCS, OCI).
- **Region in the SigV4 scope** - real region (AWS), `auto` (R2/GCS/Tigris), baked into the
  endpoint (B2), or ignored-but-required (MinIO `us-east-1`).
- **Operation set** - which S3 actions exist (`PutObject`, multipart set, `ListObjectsV2`, …).
- **Headers & semantics** - `ETag` (≠ content hash on multipart), `x-amz-*`, checksums,
  conditional requests (`If-Match`/`If-None-Match`/`If-Range`).
- **XML schemas & error codes** - response/error shapes the client must parse.

Because we sign requests ourselves with **aws4fetch** (no AWS SDK on Workers - see `monorepo.md`),
we are a direct consumer of this wire protocol and must respect these details exactly.

## Compatibility is a spectrum

Every provider supports the core object operations; they **diverge** on multipart edge cases,
conditional requests, **CORS configuration**, versioning semantics, `ListObjectsV2` vs V1,
checksums, ACL/tagging/lifecycle/object-lock, and addressing/region rules. Treat
"S3-compatible" as a claim to verify, not a guarantee. We handle divergence two ways:

1. Target a **lowest-common-denominator subset** (below).
2. Encode the rest as **provider capability flags** (`storage-providers.md` → `ProviderCapabilities`).

## The byos3 required subset (our compatibility profile)

An endpoint must support **all** of this for us to use it:

- **Auth:** SigV4 signing; presigned **PUT** and **GET** URLs with expiry between minutes and 7 days.
- **Objects:** `PutObject`, `GetObject`, `HeadObject`, `DeleteObject`.
- **Listing:** `ListObjectsV2` (with a V1 `ListObjects` fallback path for OCI).
- **Multipart:** `CreateMultipartUpload`, `UploadPart`, `CompleteMultipartUpload`,
  `AbortMultipartUpload`, `ListParts`, `ListMultipartUploads`; **≥5 MB** non-final parts; a
  readable per-part **ETag** to pass to Complete.
- **CORS:** the bucket can be made to return CORS headers that **expose `ETag`** for browser
  multipart - *by whatever mechanism the provider offers* (`PutBucketCors`, dashboard, env var, or
  automatic). Not necessarily via the S3 API.
- **Integrity:** we compute and trust our own **SHA-256** (`sync-engine.md`); we never rely on
  ETag as a content hash.

We explicitly **do not require**: ACLs, object tagging, SSE-KMS, object lock, bucket policies (we
never set them), website hosting, or S3 Select. Don't write code that depends on these.

## How we verify it (two layers)

### Layer 1 - our client conformance, against local MinIO (CI)

`packages/s3` ships an **integration test that round-trips our exact operation set** (connect-probe
→ put → head → get → list → multipart upload → complete → presigned PUT/GET → delete) against a
**local MinIO** container (a known-good S3 server). This is the primary, fast, free way to "test
our interfaces" - it validates our SigV4 signer, presigner, multipart logic, and XML parsing
against real S3 behavior on every CI run. MinIO also serves as the fixture for unit-testing the
signer. (MinIO requires path-style + region `us-east-1` - see `storage-providers.md`.)

### Layer 2 - provider certification, with ceph/s3-tests

[**ceph/s3-tests**](https://github.com/ceph/s3-tests) is the de-facto external S3-compatibility
suite (Python, `pytest`+`tox`, boto2/boto3) - "useful to people implementing software that exposes
an S3-like API." It tests an S3 **endpoint/server**, so we use it to **certify that a candidate
provider actually supports our required subset** before we promote it in `storage-providers.md`'s
support tiers - grounding the capability matrix in empirical results, not just docs.

- **Config:** copy `s3tests.conf.SAMPLE` → `byos3.conf`; set endpoint host/port/ssl, two credential
  sets, and a **bucket prefix** for test buckets.
- **Run:** `S3TEST_CONF=byos3.conf tox` - target a subset with
  `tox -- s3tests/functional/test_s3.py` (or `::test_name`), and **exclude AWS-known-failures** with
  `tox -- -m 'not fails_on_aws'`. Select the operations in our profile by keyword/marker.
- **The byos3 profile** = the subset of s3-tests that maps to our required operations (object RW,
  listing, multipart, presigned, CORS). An endpoint that passes the profile is safe to support; a
  failure pins exactly which capability flag to flip or which tier to assign.
- **⚠️ Destructive & credential-sensitive:** the suite creates and deletes many buckets and objects.
  **Run it only against a throwaway account/project with a dedicated test bucket prefix - never
  against a real user's bucket or credentials.** Some tests need STS/IAM config we don't use; skip
  those.

## Workflow for adding / certifying a provider

1. Read the provider's docs → write its `storage-providers.md` entry + set its capability flags.
2. Provision **throwaway** creds + a dedicated test bucket.
3. Run the `packages/s3` conformance test against the endpoint (our minimal must-pass).
4. Run the **byos3 ceph/s3-tests profile** against the endpoint.
5. Record results → finalize capability flags, CORS strategy, and support tier.

## Where the code lives

- `packages/s3` - the client + its MinIO conformance/integration tests.
- `tools/s3-compat/` - the `byos3.conf` template, the byos3 test-selection (profile) for
  ceph/s3-tests, and a runner script. (Added when the first non-MVP provider is certified.)

## Links

- ceph/s3-tests: https://github.com/ceph/s3-tests
- SigV4: https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html
- Virtual-hosting / addressing: https://docs.aws.amazon.com/AmazonS3/latest/userguide/VirtualHosting.html
- aws4fetch (our signer): https://github.com/mhart/aws4fetch
