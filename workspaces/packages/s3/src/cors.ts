/**
 * The CORS configuration byos3 needs on a user's bucket. Because bytes move **directly** between the
 * browser and the bucket over presigned URLs (storage-byo-s3.md), the bucket must allow the app
 * origin. A presigned PUT is never a "simple" request - the browser always preflights it and (since
 * the File body carries a Content-Type) asks to send headers - so `AllowedHeaders` MUST be present,
 * or the preflight fails with "No 'Access-Control-Allow-Origin' header". `ExposeHeaders: [ETag]` lets
 * the client read the upload's ETag.
 *
 * One source of truth: the same rule is rendered to S3 XML (to apply via `PutBucketCors`) and to the
 * JSON shown to users who configure CORS by hand.
 */
export const CORS_METHODS = ["GET", "PUT", "HEAD"] as const;
export const CORS_ALLOWED_HEADERS = ["*"] as const;
export const CORS_EXPOSE_HEADERS = ["ETag"] as const;
export const CORS_MAX_AGE_SECONDS = 3600;

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      default:
        return "&quot;";
    }
  });
}

/** The `PutBucketCors` request body: one rule allowing the given origins. */
export function corsConfigXml(origins: string[]): string {
  const o = origins.map((x) => `<AllowedOrigin>${escapeXml(x)}</AllowedOrigin>`).join("");
  const m = CORS_METHODS.map((x) => `<AllowedMethod>${x}</AllowedMethod>`).join("");
  const h = CORS_ALLOWED_HEADERS.map((x) => `<AllowedHeader>${escapeXml(x)}</AllowedHeader>`).join(
    "",
  );
  const e = CORS_EXPOSE_HEADERS.map((x) => `<ExposeHeader>${x}</ExposeHeader>`).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
    `<CORSRule>${o}${m}${h}${e}<MaxAgeSeconds>${CORS_MAX_AGE_SECONDS}</MaxAgeSeconds></CORSRule>` +
    `</CORSConfiguration>`
  );
}

/** The same rule as the JSON shown in the R2 / S3 dashboard "edit CORS policy" box. */
export function corsPolicyJson(origins: string[]): string {
  return JSON.stringify(
    [
      {
        AllowedOrigins: origins,
        AllowedMethods: [...CORS_METHODS],
        AllowedHeaders: [...CORS_ALLOWED_HEADERS],
        ExposeHeaders: [...CORS_EXPOSE_HEADERS],
        MaxAgeSeconds: CORS_MAX_AGE_SECONDS,
      },
    ],
    null,
    2,
  );
}
