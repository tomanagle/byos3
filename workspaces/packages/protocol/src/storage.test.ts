import { expect, test } from "bun:test";
import { ConnectBucketInput, S3Endpoint } from "./storage";

test("S3Endpoint prepends https:// to a scheme-less host (the R2 paste case)", () => {
  expect(S3Endpoint.parse("abc123.r2.cloudflarestorage.com")).toBe(
    "https://abc123.r2.cloudflarestorage.com",
  );
});

test("S3Endpoint leaves an explicit scheme untouched", () => {
  expect(S3Endpoint.parse("https://s3.us-east-1.amazonaws.com")).toBe(
    "https://s3.us-east-1.amazonaws.com",
  );
  expect(S3Endpoint.parse("http://localhost:9000")).toBe("http://localhost:9000");
});

test("S3Endpoint trims and rejects empty", () => {
  expect(S3Endpoint.parse("  minio.internal:9000 ")).toBe("https://minio.internal:9000");
  expect(() => S3Endpoint.parse("")).toThrow();
  expect(() => S3Endpoint.parse("   ")).toThrow();
});

test("ConnectBucketInput accepts a bare R2 host and normalizes it", () => {
  const parsed = ConnectBucketInput.parse({
    provider: "r2",
    endpoint: "acct.r2.cloudflarestorage.com",
    accessKeyId: "k",
    secret: "s",
    bucket: "my-bucket",
  });
  expect(parsed.endpoint).toBe("https://acct.r2.cloudflarestorage.com");
  expect(parsed.region).toBe("auto"); // default
  expect(parsed.prefix).toBe("byos3/"); // default
});
