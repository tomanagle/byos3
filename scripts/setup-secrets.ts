#!/usr/bin/env bun
/**
 * setup-secrets.ts - generate LOCAL dev secrets into .dev.vars (plaintext, gitignored).
 *
 *   bun run secrets:setup          create workspaces/apps/{web,api}/.dev.vars (skips existing)
 *   bun run secrets:setup --force  regenerate even if they exist (rotates keys)
 *
 * No encryption, no SOPS - local dev only. PRODUCTION secrets are set as GitHub Actions secrets and
 * pushed to the Workers by the deploy workflow (see .github/workflows/deploy.yml + README.md).
 *
 * The web and api Workers MUST share the same CREDENTIAL_ENCRYPTION_KEY + BETTER_AUTH_SECRET (they
 * bind the same D1), so this writes the same values to both .dev.vars files.
 */
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const FORCE = process.argv.includes("--force");
const WEB = join(ROOT, "workspaces", "apps", "web", ".dev.vars");
const API = join(ROOT, "workspaces", "apps", "api", ".dev.vars");

// Cloudflare Turnstile PUBLIC test secret (always passes verification) - fine for local dev only.
const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

function rand(n = 32): string {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Buffer.from(a).toString("base64");
}

async function readVar(path: string, key: string): Promise<string | null> {
  if (!(await Bun.file(path).exists())) return null;
  return (await Bun.file(path).text()).match(new RegExp(`^${key}=(.*)$`, "m"))?.[1] ?? null;
}

// Reuse existing shared keys (unless --force) so the two files stay in sync and we never silently
// rotate the key that sealed your existing local connectors.
const credKey =
  (!FORCE &&
    ((await readVar(WEB, "CREDENTIAL_ENCRYPTION_KEY")) ??
      (await readVar(API, "CREDENTIAL_ENCRYPTION_KEY")))) ||
  rand(32);
const authSecret =
  (!FORCE &&
    ((await readVar(WEB, "BETTER_AUTH_SECRET")) ?? (await readVar(API, "BETTER_AUTH_SECRET")))) ||
  rand(32);

const webVars: Record<string, string> = {
  TURNSTILE_SECRET_KEY: TURNSTILE_TEST_SECRET,
  CREDENTIAL_ENCRYPTION_KEY: credKey,
  BETTER_AUTH_SECRET: authSecret,
  // Local dev points connectors at MinIO/localhost (http, private host), so relax the SSRF endpoint
  // guard here. Hosted deploys leave this unset = require https + public hosts. See agents/docs/secrets.md.
  ALLOW_PRIVATE_S3_ENDPOINTS: "true",
  // Optional - fill in to enable; blank is fine for core local dev.
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
};
const apiVars: Record<string, string> = {
  CREDENTIAL_ENCRYPTION_KEY: credKey,
  BETTER_AUTH_SECRET: authSecret,
  ALLOW_PRIVATE_S3_ENDPOINTS: "true",
};

await writeVars(WEB, webVars);
await writeVars(API, apiVars);
console.log(
  "\nLocal secrets ready (gitignored). Production secrets are set in GitHub - see README.md.",
);

async function writeVars(path: string, vars: Record<string, string>): Promise<void> {
  if (!FORCE && (await Bun.file(path).exists())) {
    console.log(`• ${rel(path)} exists - skipping (use --force to regenerate)`);
    return;
  }
  await Bun.write(
    path,
    Object.entries(vars)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
  );
  console.log(`✓ wrote ${rel(path)}`);
}
function rel(p: string): string {
  return p.replace(`${ROOT}/`, "");
}
