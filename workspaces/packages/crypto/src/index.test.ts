import { test, expect } from "bun:test";
import { CredentialVault, generateRootKey } from "./index";

test("seal/open round-trips", async () => {
  const vault = new CredentialVault(generateRootKey());
  const secret = "AKIAEXAMPLE/very+secret/key==";
  const sealed = await vault.seal(secret);
  expect(sealed).not.toContain(secret);
  expect(await vault.open(sealed)).toBe(secret);
});

test("ciphertext is non-deterministic", async () => {
  const vault = new CredentialVault(generateRootKey());
  expect(await vault.seal("x")).not.toBe(await vault.seal("x"));
});

test("a different root key cannot open", async () => {
  const a = new CredentialVault(generateRootKey());
  const b = new CredentialVault(generateRootKey());
  const sealed = await a.seal("secret");
  await expect(b.open(sealed)).rejects.toThrow();
});

test("rejects a wrong-size root key", () => {
  expect(() => new CredentialVault(btoa("too-short"))).toThrow();
});
