import { test, expect } from "bun:test";
import { createDriver } from "@byos3/s3";
import { Connector } from "./connector";
import { Volume } from "./volume";
import type { Vault } from "./ports";

// Fake vault: trivial reversible "encryption" - enough to prove open() is the only place the
// secret materializes and that it never reaches the presigned URL.
const fakeVault: Vault = {
  seal: async (p) => `sealed:${p}`,
  open: async (c) => c.replace(/^sealed:/, ""),
};

function makeVolume(): Volume {
  const connector = new Connector(
    {
      id: "conn_1",
      ownerUserId: "u1",
      provider: "r2",
      endpoint: "https://acct.r2.cloudflarestorage.com",
      region: "auto",
      accessKeyId: "AKIAEXAMPLE",
      secretCipher: "sealed:topsecret-value",
      label: "r2",
      status: "active",
      createdAt: 0,
    },
    { vault: fakeVault, driverFactory: createDriver },
  );
  return new Volume(
    {
      id: "vol_1",
      connectorId: "conn_1",
      namespaceId: "ns_1",
      bucket: "my-bucket",
      prefix: "byos3/",
      label: "R2",
      status: "active",
      createdAt: 0,
    },
    { connector },
  );
}

test("presignPut scopes a chunk under the volume prefix and never leaks the secret", async () => {
  const v = makeVolume();
  const hash = "a".repeat(64);
  const req = await v.presignPut(v.chunkKey(hash));
  const u = new URL(req.url);
  expect(req.method).toBe("PUT");
  expect(u.pathname).toBe(`/my-bucket/byos3/chunks/${hash}`);
  expect(u.searchParams.get("X-Amz-Signature")).toBeTruthy();
  expect(req.url).not.toContain("topsecret-value");
});

test("presignGet works and scopes the key", async () => {
  const v = makeVolume();
  const req = await v.presignGet(v.chunkKey("b".repeat(64)));
  expect(req.method).toBe("GET");
  expect(new URL(req.url).pathname).toContain("/byos3/chunks/");
});

test("scope guard rejects path traversal", async () => {
  const v = makeVolume();
  await expect(v.presignGet("../secrets")).rejects.toThrow();
});
