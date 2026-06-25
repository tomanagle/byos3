import { test, expect } from "bun:test";
import { createDriver } from "./index";

const driver = createDriver({
  provider: "r2",
  endpoint: "https://acct123.r2.cloudflarestorage.com",
  region: "auto",
  accessKeyId: "AKIAEXAMPLE",
  secret: "shhh-secret-key",
  bucket: "my-bucket",
});

test("presignPut yields a path-style, SigV4 query-signed PUT URL", async () => {
  const req = await driver.presignPut("byos3/chunks/abc123", { expiresIn: 600 });
  const u = new URL(req.url);
  expect(req.method).toBe("PUT");
  expect(u.host).toBe("acct123.r2.cloudflarestorage.com");
  expect(u.pathname).toBe("/my-bucket/byos3/chunks/abc123");
  expect(u.searchParams.get("X-Amz-Expires")).toBe("600");
  expect(u.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
  expect(u.searchParams.get("X-Amz-Signature")).toBeTruthy();
  expect(u.searchParams.get("X-Amz-Credential")).toContain("AKIAEXAMPLE");
  // the secret must never appear in the URL
  expect(req.url).not.toContain("shhh-secret-key");
});

test("presignGet is a signed GET", async () => {
  const req = await driver.presignGet("byos3/chunks/abc123");
  expect(req.method).toBe("GET");
  expect(new URL(req.url).searchParams.get("X-Amz-Signature")).toBeTruthy();
});

test("capabilities are exposed per provider (R2 region=auto)", () => {
  expect(driver.capabilities.region).toBe("auto");
  expect(driver.capabilities.forcePathStyle).toBe(true);
});
