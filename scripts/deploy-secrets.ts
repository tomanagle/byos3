#!/usr/bin/env bun
/**
 * deploy-secrets.ts — push PRODUCTION secrets to the Worker.
 *
 *   bun run secrets:deploy
 *
 * Decrypts secrets/prod.sops.env (committed, encrypted) and uploads every key via
 * `wrangler secret bulk`. Requires an age private key that can decrypt prod (a
 * recipient listed in .sops.yaml). See agents/docs/secrets.md.
 */
import { $ } from "bun";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const ROOT = join(import.meta.dir, "..");
const PROD = join(ROOT, "secrets", "prod.sops.env");
const APP = join(ROOT, "apps", "web");
$.cwd(ROOT);

if (!Bun.which("sops")) die("'sops' not found. Install with:  brew install sops age");
if (!(await Bun.file(PROD).exists())) die(`${PROD} not found.`);

const plain = await $`sops --decrypt --input-type dotenv --output-type dotenv ${PROD}`.text();
const obj: Record<string, string> = {};
for (const line of plain.split("\n").map((l) => l.trim())) {
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i === -1) continue;
  obj[line.slice(0, i).trim()] = line.slice(i + 1);
}
const keys = Object.keys(obj);
if (keys.length === 0) die("No secrets found in prod file.");

console.log(`About to push ${keys.length} production secrets: ${keys.join(", ")}`);
if ((prompt("Type 'deploy' to confirm:") ?? "").trim() !== "deploy") die("Aborted.");

const tmp = join(tmpdir(), `byos3-prod-${Math.trunc(performance.now())}.bulk.json`);
await Bun.write(tmp, JSON.stringify(obj));
try {
  await $`bunx wrangler secret bulk ${tmp}`.cwd(APP);
} finally {
  await rm(tmp, { force: true });
}
console.log("Pushed.");

function die(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}
