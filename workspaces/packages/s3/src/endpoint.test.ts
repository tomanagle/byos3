import { expect, test } from "bun:test";
import { assertAllowedS3Endpoint } from "./endpoint";

const ok = (url: string, allowPrivate = false) =>
  expect(() => assertAllowedS3Endpoint(url, { allowPrivate })).not.toThrow();
const blocked = (url: string, allowPrivate = false) =>
  expect(() => assertAllowedS3Endpoint(url, { allowPrivate })).toThrow();

test("allows public https S3 endpoints", () => {
  ok("https://s3.us-east-1.amazonaws.com");
  ok("https://acct.r2.cloudflarestorage.com");
  ok("https://s3.us-west-002.backblazeb2.com");
});

test("blocks cloud instance-metadata addresses ALWAYS (even with allowPrivate)", () => {
  for (const allowPrivate of [false, true]) {
    blocked("http://169.254.169.254/latest/meta-data/", allowPrivate);
    blocked("https://169.254.169.254/", allowPrivate);
    blocked("http://169.254.170.2/", allowPrivate); // ECS
    blocked("http://metadata.google.internal/", allowPrivate);
    blocked("http://metadata/", allowPrivate);
  }
});

test("blocks loopback / private / link-local by default", () => {
  blocked("http://localhost:9000");
  blocked("https://localhost:9000");
  blocked("http://127.0.0.1:9000");
  blocked("https://10.0.0.5");
  blocked("https://192.168.1.10");
  blocked("https://172.16.0.1");
  blocked("https://172.31.255.255");
  blocked("https://[::1]:9000");
  blocked("https://[fd00::1]"); // unique-local
  blocked("https://[fe80::1]"); // link-local
});

test("requires https by default", () => {
  blocked("http://s3.amazonaws.com");
  ok("https://s3.amazonaws.com");
});

test("allowPrivate permits http + internal hosts (self-hosted MinIO)", () => {
  ok("http://localhost:9000", true);
  ok("http://minio:9000", true);
  ok("http://10.0.0.5:9000", true);
  ok("https://172.16.0.1", true);
});

test("rejects non-URL input", () => {
  blocked("not a url");
  blocked("");
});
