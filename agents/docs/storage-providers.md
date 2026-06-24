# S3-compatible storage providers — credentials, permissions, quirks

Reference for every provider we (intend to) support as a **connector**. For each: how a user
creates scoped credentials, the **minimum permissions** for our operation set, the endpoint/region
to use, CORS support, gotchas, and authoritative doc links. See `storage-byo-s3.md` for how
connectors/volumes use this, and `data-model.md` for the `connector`/`volume` tables.

## What we ask the user for (the connect contract)

`{ provider, accessKeyId, secretAccessKey, endpoint?, region?, bucket, prefix = "byos3/" }`.
We validate, then store the secret envelope-encrypted (`secrets.md` / `crypto`).

## Our operation set

`HeadBucket` (validation), `PutObject`, `GetObject`, `HeadObject`, `DeleteObject`,
`ListObjectsV2`, multipart (`CreateMultipartUpload`, `UploadPart`, `CompleteMultipartUpload`,
`AbortMultipartUpload`, `ListParts`, `ListMultipartUploads`), presigned **PUT/GET**, and
(where supported) `PutBucketCors`/`GetBucketCors`. All content under one prefix (`byos3/`).

## Universal principles

- **Least privilege = dedicated bucket + `byos3/` prefix + a scoped key.** Push scoping onto the
  user's side wherever the provider supports it.
- **Validate with `ListObjectsV2(prefix="byos3/", max-keys=1)`, not `HeadBucket`.** It works
  identically everywhere and keeps AWS/Wasabi/MinIO `s3:prefix` policy conditions intact (a bare
  HeadBucket isn't matched by a prefix-conditioned `ListBucket`).
- **Presigned PUT only** — never rely on browser POST (unsupported on R2/B2 and unneeded).
- **ETag ≠ content hash** for multipart objects everywhere → trust our client-computed SHA-256
  (`sync-engine.md`). Expose `ETag` in CORS so the browser can read per-part ETags.
- **`byos3/` is a security boundary only where IAM/policy can enforce it.** Where it can't
  (GCS, OCI, iDrive e2), it's an app convention only → recommend a dedicated bucket.

## Capability matrix

| Provider | Credential model | Key scopable to 1 bucket | Prefix-enforceable | `PutBucketCors` via S3 API | Region string | Path-style | Notes |
|---|---|---|---|---|---|---|---|
| **AWS S3** | IAM user access key + policy | ✅ (policy) | ✅ (`s3:prefix`) | ✅ | real region | virtual-host | gold standard |
| **Cloudflare R2** | R2 API token → AKID/secret | ✅ (token→bucket) | ⚠️ temp creds only | ⚠️ Admin token only | `auto` | either | no POST; `If-Range` unsupported |
| **Backblaze B2** | Application Key | ✅ (+prefix) | ✅ (`namePrefix`) | ✅ (S3 API) | in endpoint (`us-west-001`…) | virtual-host | versioned by default (soft delete) |
| **Wasabi** | IAM user access key + policy | ✅ (policy) | ✅ (`s3:prefix`) | ❌ (auto wildcard) | regional | virtual-host | 90-day min storage |
| **DigitalOcean Spaces** | Spaces key (limited/full) | ✅ (limited key) | ❌ (key-level) | ✅ (S3 API + UI) | dc code (`nyc3`) | either | CDN endpoint ~8 MiB PUT cap |
| **Scaleway** | IAM API key (project-wide) | ❌ (use bucket policy) | ✅ via bucket policy | ✅ | `fr-par`… | path/virtual | "preferred project" trap |
| **Hetzner** | S3 key (project-wide) | ❌ (use bucket policy) | ✅ via bucket policy | ✅ (CLI only, no UI) | location (`fsn1`) | virtual-host | bucket-policy only; no IAM |
| **Storj** | Access grant → S3 creds | ✅ (grant) | ✅ (grant path) | ❌ (gateway default) | any (`us-east-1`) | — | use 64 MB parts |
| **Tigris** | IAM access key + policy | ✅ | ✅ (`s3:prefix`) | ✅ | `auto` | — | closest to AWS |
| **iDrive e2** | console key (region+bucket) | ✅ (bucket list) | ❌ | ❌ (dashboard/region API) | real code | — | **per-user endpoint** |
| **MinIO** (community) | access key / svc account | ✅ (policy) | ✅ (`s3:prefix`) | ❌ (env var; AIStor-only API) | `us-east-1` | **required** | self-hosted |
| **Google Cloud Storage** | HMAC key (service account) | ❌ (bucket-level IAM) | ❌ | ❌ (gcloud out-of-band) | `auto` | **required** | XML/interop API |
| **Oracle OCI** | Customer Secret Key | ❌ (user policy) | ❌ | ❌ (**none — proxy needed**) | real id + namespace | **required** | ListObjectsV2→V1; **breaks no-bytes rule** |

Legend: ✅ supported · ⚠️ conditional · ❌ not via S3 API.

---

## AWS S3

- **Create creds:** IAM → Users → create user (no console access) → attach the policy below →
  Security credentials → Create access key → "Application running outside AWS". Secret shown once.
  CLI: `aws iam create-user` / `put-user-policy` / `create-access-key`. Scoping is entirely via
  the policy (no key-level scoping).
- **Min policy** (bucket-level actions need the bucket ARN + `s3:prefix`; object actions need the
  `/byos3/*` ARN):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "ListWithinPrefix", "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:ListBucketMultipartUploads"],
      "Resource": "arn:aws:s3:::BUCKET",
      "Condition": { "StringLike": { "s3:prefix": ["byos3/*", "byos3"] } } },
    { "Sid": "Cors", "Effect": "Allow",
      "Action": ["s3:GetBucketCORS", "s3:PutBucketCORS"], "Resource": "arn:aws:s3:::BUCKET" },
    { "Sid": "Objects", "Effect": "Allow",
      "Action": ["s3:PutObject","s3:GetObject","s3:DeleteObject","s3:AbortMultipartUpload","s3:ListMultipartUploadParts"],
      "Resource": "arn:aws:s3:::BUCKET/byos3/*" } ]
}
```
  HeadBucket→`s3:ListBucket`, HeadObject→`s3:GetObject`; multipart Create/Upload/Complete→`s3:PutObject`,
  Abort→`s3:AbortMultipartUpload`, ListParts→`s3:ListMultipartUploadParts`,
  ListMultipartUploads→`s3:ListBucketMultipartUploads`. Don't add `ListAllMyBuckets`/`GetBucketLocation` (console-only).
- **Endpoint/region:** virtual-hosted `https://BUCKET.s3.REGION.amazonaws.com`; region = the
  bucket's real region (sign with it or get `AuthorizationHeaderMalformed`).
- **CORS:** JSON via console or `PutBucketCors`; `ExposeHeaders:[ETag]`, methods GET/PUT/HEAD.
- **Docs:** [IAM keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html) ·
  [prefix policy examples](https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-policies-s3.html) ·
  [multipart permissions](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html#mpuAndPermissions) ·
  [action reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazons3.html) ·
  [CORS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html)

## Cloudflare R2

- **Create creds:** R2 → Manage API Tokens → Create → **Account** token → permission group
  **Object Read & Write** → "Apply to specific buckets only". AKID = token id; **Secret = SHA-256
  of the token value** (dashboard shows it). Object groups work only over the S3 API (our case).
- **Min scope:** permission group **Object Read & Write** on the one bucket — covers all object +
  multipart ops. No JSON policy. **No prefix restriction on persistent tokens** — only via
  [temporary credentials](https://developers.cloudflare.com/r2/api/s3/temporary-credentials/)
  (prefix/object-scoped, parent-token-derived; the right tool if we mint per-session client creds).
  **CORS via S3 needs an Admin token** — prefer the user sets CORS out-of-band (dashboard/Wrangler)
  and keep the app token object-only.
- **Endpoint/region:** `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto`
  (jurisdictions: `.eu`/`.fedramp` hosts).
- **CORS:** dashboard / `wrangler r2 bucket cors set` / `PutBucketCors` (admin). Exact `scheme://host`
  origins (no path); ~30s propagation.
- **Gotchas:** presigned GET/HEAD/PUT/DELETE only — **no POST**; expiry 1s–7d; conditional reqs
  except `If-Range`; only `STANDARD`/`STANDARD_IA`; no KMS/object-lock/tagging.
- **Docs:** [tokens](https://developers.cloudflare.com/r2/api/tokens/) ·
  [S3 get-started](https://developers.cloudflare.com/r2/get-started/s3/) ·
  [presigned](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) ·
  [CORS](https://developers.cloudflare.com/r2/buckets/cors/)

## Backblaze B2

- **Create creds:** B2 → Application Keys → Add a New Application Key → restrict to one bucket,
  set **File name prefix** = `byos3/`, access Read+Write, optionally tick "Allow List All Bucket
  Names" (needed for S3 bucket-level calls). `keyID`→AKID, `applicationKey`→secret (shown once).
  **The master key does NOT work with the S3 API** — require a non-master key.
- **Min capabilities:** `listBuckets`, `listAllBucketNames`, `listFiles`, `readFiles`,
  `writeFiles`, `deleteFiles` (+ bucket + `byos3/` prefix). Prefix is enforced server-side.
- **Endpoint/region:** `s3.<region>.backblazeb2.com` (e.g. `s3.us-west-001.backblazeb2.com`);
  region = the middle segment. Single region per account — have the user paste the endpoint.
- **CORS:** `PutBucketCors`/`GetBucketCors` supported via S3 API (AllowedOrigin non-empty;
  MaxAge 0–86400). **Rules set via S3 can't be edited via the native API** and vice-versa.
- **Gotchas (important):** buckets **versioned by default** — `DeleteObject` without a `versionId`
  only inserts a **delete marker** (old versions persist + bill). Delete by `versionId` or have
  users set a "keep last version" lifecycle rule. Multipart min part 5 MB.
- **Docs:** [app keys](https://www.backblaze.com/docs/cloud-storage-create-and-manage-app-keys) ·
  [capabilities](https://www.backblaze.com/docs/cloud-storage-application-key-capabilities) ·
  [S3 keys mapping](https://www.backblaze.com/docs/cloud-storage-s3-compatible-app-keys) ·
  [CORS](https://www.backblaze.com/docs/cloud-storage-cross-origin-resource-sharing-rules) ·
  [versions](https://www.backblaze.com/docs/cloud-storage-file-versions)

## Wasabi

- **Create creds:** Users → Create User → Programmatic access → attach IAM policy → returns
  AKID/secret (max 2 keys/user). Maps directly (no transform).
- **Min policy:** standard AWS-style JSON scoped to bucket + `byos3/*` (same shape as AWS;
  `s3:ListBucket`+`s3:ListBucketMultipartUploads` on bucket with `s3:prefix`; object RW + abort +
  list-parts on `/byos3/*`).
- **Endpoint/region:** `s3.<region>.wasabisys.com` (`us-east-1`, `eu-central-1`, `ap-northeast-1`,
  …); `s3.wasabisys.com` = legacy us-east-1 alias.
- **CORS:** **NOT configurable — `PutBucketCors`/`GetBucketCors` unsupported.** Wasabi returns
  automatic wildcard CORS (`Access-Control-Allow-Origin: *`, exposes all headers) when an `Origin`
  is present, so browser presigned PUT/GET "just works" but can't be tightened. Our adapter must
  **no-op** CORS calls for Wasabi (don't fail validation).
- **Gotchas:** 90-day minimum storage charge (churny syncs cost); versioning off by default (clean
  deletes); otherwise high AWS fidelity.
- **Docs:** [create user/key](https://docs.wasabi.com/docs/creating-a-user-account-and-access-key) ·
  [bucket policy](https://docs.wasabi.com/docs/bucket-policy) ·
  [regions](https://docs.wasabi.com/docs/what-are-the-service-urls-for-wasabi-s-different-storage-regions) ·
  [CORS unsupported](https://docs.wasabi.com/apidocs/bucket-cors-support-with-the-wasabi-s3-api)

## DigitalOcean Spaces

- **Create creds:** Control Panel → Spaces → Access Keys → Create. **Limited access** key scoped
  to the bucket with **Read/Write/Delete** is the right BYO credential. Console-only (no API/CLI
  for key creation). **Limited keys are mutually exclusive with bucket policies** — pick one.
- **Min scope:** limited key, one bucket, Read/Write/Delete (no finer grain). Prefix not
  key-enforceable.
- **Endpoint/region:** `https://<region>.digitaloceanspaces.com`; region = dc code (`nyc3`,`fra1`,…).
- **CORS:** `PutBucketCors` (XML) or Control Panel UI; `ExposeHeader` only via API.
- **Gotchas:** presigned PUT over the **CDN endpoint capped ~8 MiB** → use the **origin** endpoint
  or multipart; historical `501` on `ListMultipartUploads` (probe before relying on it for cleanup).
- **Docs:** [manage access](https://docs.digitalocean.com/products/spaces/how-to/manage-access/) ·
  [S3 compat](https://docs.digitalocean.com/products/spaces/reference/s3-compatibility/) ·
  [CORS](https://docs.digitalocean.com/products/spaces/how-to/configure-cors/) ·
  [limits](https://docs.digitalocean.com/products/spaces/details/limits/)

## Scaleway Object Storage

- **Create creds:** IAM → API keys → Generate (attach to a user/application; set a **preferred
  Project** — the key only operates in that project). Keys are **project-wide, not per-bucket**.
- **Min scope:** IAM permission sets `ObjectStorageObjectsRead` + `…ObjectsWrite` +
  `…ObjectsDelete` + `ObjectStorageBucketsRead` (add `…BucketsWrite` if the app sets CORS). To
  confine to one bucket + prefix, attach a **bucket policy** (grammar `2023-04-17`, action allowed
  only if both IAM **and** bucket policy permit), principal `application_id:<APP_ID>`, `Resource`
  `["BUCKET","BUCKET/*"]`.
- **Endpoint/region:** `https://s3.<region>.scw.cloud`; region `fr-par`/`nl-ams`/`pl-waw`/`it-mil`.
- **CORS:** `PutBucketCors`/`GetBucketCors` (S3 API) or Console.
- **Gotchas:** the **preferred-project trap** (valid key, empty/denied because its project lacks
  the bucket) — surface a clear validation error.
- **Docs:** [IAM keys + Object Storage](https://www.scaleway.com/en/docs/iam/api-cli/using-api-key-object-storage/) ·
  [permission sets](https://www.scaleway.com/en/docs/iam/reference-content/permission-sets/) ·
  [bucket policy](https://www.scaleway.com/en/docs/object-storage/api-cli/bucket-policy/) ·
  [CORS](https://www.scaleway.com/en/docs/object-storage/api-cli/setting-cors-rules/)

## Hetzner Object Storage

- **Create creds:** Console → project → Security → S3 Credentials → Generate (Console only; shown
  once). **Project-wide, valid for every bucket** — no per-key scoping. No IAM users/roles/STS.
- **Min scope:** **bucket policies only** (AWS-style JSON), principal
  `arn:aws:iam:::user/p<PROJECT_ID>:<ACCESS_KEY>`, `Resource` `[".../BUCKET",".../BUCKET/*"]`, the
  standard object-RW + list + multipart actions.
- **Endpoint/region:** `https://<location>.your-objectstorage.com` (`fsn1`/`nbg1`/`hel1`); set
  region = location, **SigV4 + virtual-hosted**.
- **CORS:** `PutBucketCors`/`GetBucketCors` via S3 API only (**no UI**) — the app must own it.
- **Gotchas:** restricting a bucket to a key breaks the Console object browser (expected); 64 KB
  min billable object size; 750 req/s per bucket; some SDKs need payload signing disabled.
- **Docs:** [generate keys](https://docs.hetzner.com/storage/object-storage/getting-started/generating-s3-keys/) ·
  [supported actions](https://docs.hetzner.com/storage/object-storage/supported-actions/) ·
  [CORS](https://docs.hetzner.com/storage/object-storage/howto-protect-objects/cors/)

## Storj

- **Create creds:** not IAM — an **access grant** (macaroon) exchanged for S3 creds. Console →
  Access Keys → New → S3 Credentials (bucket-level only). For **prefix** scoping use the uplink
  CLI: `uplink share sj://BUCKET/byos3/ --register --readonly=false` (flags
  `--disallow-reads/writes/lists/deletes`, `--not-after`). Restrictions are immutable — re-mint to
  change.
- **Min scope:** Read+Write+List+Delete on `sj://BUCKET/byos3/`. Encrypted-by-default: a
  passphrase mismatch yields empty listings, not errors.
- **Endpoint/region:** `https://gateway.storjshare.io`; region any (`us-east-1`).
- **CORS:** **unsupported via S3 API** — gateway applies a permissive default that exposes `ETag`
  (so presigned multipart works); not customizable. Adapter no-ops CORS.
- **Gotchas:** segment size 64 MB → **use 64 MB multipart parts**; `ListObjectsV2`/range/
  `ListMultipartUploads` marked "partial" (test pagination); no ACLs.
- **Docs:** [access](https://storj.dev/dcs/access) ·
  [S3 gateway](https://storj.dev/dcs/api/s3/s3-compatible-gateway) ·
  [S3 compatibility](https://storj.dev/dcs/api/s3/s3-compatibility) ·
  [multipart part size](https://storj.dev/dcs/api/s3/multipart-upload/multipart-part-size)

## Tigris (tigrisdata / Fly.io)

- **Create creds:** Web Console → Access Keys → create (role Admin/Editor/ReadOnly + bucket scope);
  attach a JSON IAM policy for finer scope. **Editor** role suffices for our ops.
- **Min policy:** standard AWS JSON; `bucket` ARN for `ListBucket`/`ListBucketMultipartUploads`/
  CORS, `bucket/byos3/*` for object RW + abort + list-parts. Multipart create/upload/complete are
  gated by `s3:PutObject` (no distinct `s3:CreateMultipartUpload`).
- **Endpoint/region:** `https://t3.storage.dev` (external) / `https://fly.storage.tigris.dev`
  (inside Fly); region `auto`.
- **CORS:** full `PutBucketCors`/`GetBucketCors`/`DeleteBucketCors` via S3 API + Console.
- **Gotchas:** ~90% S3 compat; globally distributed (load-test list-after-write).
- **Docs:** [web console](https://www.tigrisdata.com/docs/web-console/) ·
  [IAM policies](https://www.tigrisdata.com/docs/iam/policies/) ·
  [supported actions](https://www.tigrisdata.com/docs/iam/policies/supported-actions/) ·
  [S3 API](https://www.tigrisdata.com/docs/api/s3/)

## iDrive e2

- **Create creds:** Dashboard → Access Keys → Create → pick **region** (key is region-bound),
  permission tier, bucket list. Secret shown once.
- **Min scope:** bucket-level read/write/delete only — **no prefix scoping, no JSON policy** for
  end-user keys. Enforce `byos3/` in app code.
- **Endpoint/region:** **per-user endpoint** `https://<unique>.<region>.idrivee2-<N>.com` (differs
  per account!) — resolve via `GET /get_region_endpoint`, never hardcode. Region = real code.
- **CORS:** per-region in the dashboard / region API — **not** via S3 `PutBucketCors`. Expose ETag
  there for browser multipart.
- **Gotchas:** multipart steps must complete within the presigned URL validity window.
- **Docs:** [developer guide](https://www.idrive.com/s3-storage-e2/developer-guide) ·
  [endpoints](https://www.idrive.com/s3-storage-e2/e2-endpoint-urls) ·
  [region endpoint API](https://www.idrive.com/s3-storage-e2/guides/get_region_endpoint)

## MinIO (self-hosted)

- **Create creds:** issue a **service account / access key** owned by an IAM user (not root):
  `mc admin accesskey create ALIAS user --access-key … --secret-key … --policy policy.json`.
  Inline policy can only *further restrict* the parent.
- **Min policy:** AWS-style JSON — object RW + abort + list-parts on `arn:aws:s3:::BUCKET/byos3/*`;
  `ListBucket`+`ListBucketMultipartUploads`+`GetBucketLocation` on the bucket with `s3:prefix`.
- **Endpoint/region:** `scheme://host:9000`; region must be **`us-east-1`** (or `MINIO_SITE_REGION`)
  or SigV4 fails; **path-style required** (`forcePathStyle: true`).
- **CORS:** community has **no `PutBucketCors` API** — set the server env var
  `MINIO_API_CORS_ALLOW_ORIGIN` (default `*`); the bucket-CORS API is AIStor-only. Adapter no-ops
  CORS for community MinIO.
- **Gotchas:** HeadBucket returns 400 under virtual-hosted style (use path-style);
  `ListMultipartUploads` requires the exact object name as prefix (track upload IDs yourself).
- **Docs:** [accesskey](https://docs.min.io/community/minio-object-store/reference/minio-mc-admin/mc-admin-accesskey.html) ·
  [S3 compatibility](https://docs.min.io/enterprise/aistor-object-store/developers/s3-api-compatibility/)

## Google Cloud Storage (XML / interoperability)

- **Create creds:** Cloud Storage → Settings → Interoperability → "Create a key for a service
  account" (`gcloud storage hmac create SA_EMAIL`). AKID starts `GOOG…`; secret shown once. Wait
  ~60s before first use.
- **Min scope:** grant the **service account** `roles/storage.objectUser` (objects + multipart).
  IAM is **bucket-level, not prefix-level** → `byos3/` is convention only; use a dedicated bucket.
  HeadBucket (`storage.buckets.get`) and CORS (`storage.buckets.update`) need extra perms — keep
  those out of the app's runtime SA.
- **Endpoint/region:** `https://storage.googleapis.com`; region `auto`; **path-style**
  (`forcePathStyle: true`, required for dotted names).
- **CORS:** **not** via S3 API — set out-of-band: `gcloud storage buckets update gs://BUCKET
  --cors-file=cors.json` (needs `storage.buckets.update`).
- **Gotchas:** multipart S3-compatible but no preconditions, no MD5-as-hash; ListObjectsV2 via
  `list-type=2`; prefer presigned PUT over native POST.
- **Docs:** [HMAC keys](https://cloud.google.com/storage/docs/authentication/managing-hmackeys) ·
  [IAM roles](https://cloud.google.com/storage/docs/access-control/iam-roles) ·
  [XML multipart](https://cloud.google.com/storage/docs/multipart-uploads) ·
  [CORS](https://cloud.google.com/storage/docs/using-cors)

## Oracle OCI Object Storage (S3 Compatibility API)

- **Create creds:** Identity → Users → user → **Customer Secret Keys** → Generate (AKID is
  OCID-derived; secret shown once; max 2/user). `oci iam customer-secret-key create`.
- **Min scope:** IAM policy on the user's group: `Allow group G to read buckets in compartment C
  where target.bucket.name='BUCKET'` + `… to manage objects in compartment C where
  target.bucket.name='BUCKET'`. **Prefix conditions only apply to single-object calls**, not
  list/multipart → `byos3/` not enforceable; use a dedicated bucket.
- **Endpoint/region:** `https://<namespace>.compat.objectstorage.<region>.oraclecloud.com`; region
  = real OCI id; **path-style required** (`forcePathStyle`).
- **CORS:** **none — not supported by the S3 or native API.** Browser cross-origin requests can't
  get `Access-Control-Allow-Origin`.
- **Gotchas — biggest:** **CORS impossible → browser-direct transfer is blocked, which breaks our
  "bytes never through the Worker" rule.** OCI would require proxying bytes (a deliberate
  exception) or be **unsupported for browser clients**. Also: **`ListObjectsV2` not supported → use
  V1**; **disable `aws-chunked`** streaming (`chunkedEncodingEnabled=false`) or signatures fail;
  SigV4 only.
- **Docs:** [credentials](https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/managingcredentials.htm) ·
  [S3 compat](https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/s3compatibleapi.htm) ·
  [policy reference](https://docs.oracle.com/en-us/iaas/Content/Identity/Reference/objectstoragepolicyreference.htm) ·
  [supported ops](https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/s3compatibleapi_topic-Amazon_S3_Compatibility_API_Support.htm)

---

## What this means for `packages/s3` — provider capability flags

Each provider adapter declares capabilities so the rest of the app branches on data, not
`if (provider === …)` scattered everywhere:

```ts
interface ProviderCapabilities {
  corsViaS3Api: boolean;      // false → CORS set out-of-band by the user (Wasabi, Storj, iDrive, MinIO-community, GCS, OCI)
  corsAutomatic: boolean;     // provider returns permissive CORS automatically (Wasabi, Storj)
  prefixEnforceable: boolean; // false → byos3/ is convention only; recommend dedicated bucket (GCS, OCI, iDrive, DO)
  presignPost: boolean;       // almost always false — we use PUT
  forcePathStyle: boolean;    // MinIO, GCS, OCI
  region: "real" | "auto" | "any" | "in-endpoint";
  perUserEndpoint: boolean;   // iDrive e2 — must resolve dynamically
  requiresProxy: boolean;     // OCI — no CORS → cannot do browser-direct transfer
  versionedByDefault: boolean;// B2 — delete = soft delete; needs versionId/lifecycle
  recommendedPartSizeBytes: number; // Storj = 64 MB; others 8 MB default
}
```

Consequences to implement:
- **CORS is provider-specific.** Never assume `PutBucketCors`. On `corsViaS3Api:false` providers,
  the connect flow shows the user the exact CORS JSON/steps to apply themselves (or no-ops where
  CORS is automatic). Don't fail connect-validation over CORS.
- **`requiresProxy` providers (OCI) cannot do browser-direct transfer** — either proxy bytes (an
  explicit, documented exception to the no-bytes rule, like the AI indexer) or mark them
  unsupported for web clients. Default: **unsupported in MVP**, revisit later.
- **Validation** = `ListObjectsV2(prefix="byos3/", max-keys=1)` everywhere (V1 fallback for OCI).
- **Delete/GC** must honor `versionedByDefault` (B2: delete by `versionId` or guide a lifecycle rule).
- **Per-user endpoint** (iDrive e2) is resolved at connect and stored on the `connector`/`volume`.

## Support tiers (recommendation)

- **Tier 1 (first-class, MVP):** Cloudflare R2, AWS S3, Backblaze B2. Already the design targets.
- **Tier 2 (easy adds, full browser-direct):** Wasabi, DigitalOcean Spaces, Tigris, Scaleway,
  Hetzner. Mostly differ only in CORS handling + endpoint/region.
- **Tier 3 (works, caveats):** iDrive e2 (per-user endpoint), MinIO (self-host, path-style).
- **Tier 4 (problematic):** GCS (CORS out-of-band, bucket-level scope), **OCI (no CORS → needs a
  proxy; defer / mark web-unsupported)**.
