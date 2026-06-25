#!/usr/bin/env bun
/**
 * setup-secrets.ts - interactive LOCAL secrets bootstrap (SOPS + age).
 *
 *   bun run secrets:setup          prompt for values → encrypted local file + .dev.vars
 *   bun run secrets:setup --sync   regenerate .dev.vars from the existing encrypted file
 *
 * Produces:
 *   secrets/local.sops.env   SOPS-encrypted, GITIGNORED, encrypted to YOUR age key
 *   apps/web/.dev.vars       plaintext for `wrangler dev` / vite, GITIGNORED
 *     (falls back to repo-root .dev.vars until apps/web exists)
 *
 * These are PLATFORM secrets (the Worker's own) - NOT end-user bucket creds.
 * See agents/docs/secrets.md.
 */
import { $ } from "bun";
import { dirname, join } from "node:path";
import { mkdir, chmod, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";

const ROOT = join(import.meta.dir, "..");
const ENC = join(ROOT, "secrets", "local.sops.env");
const SYNC = process.argv.includes("--sync");
$.cwd(ROOT);

// 1. Required tools
for (const t of ["sops", "age", "age-keygen"]) {
  if (!Bun.which(t)) die(`'${t}' not found. Install with:  brew install sops age`);
}

// 2. Ensure an age key exists at the SOPS default discovery path (so decrypt "just works")
const keyFile =
  process.env.SOPS_AGE_KEY_FILE ??
  join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "sops", "age", "keys.txt");
if (!(await Bun.file(keyFile).exists())) {
  await mkdir(dirname(keyFile), { recursive: true });
  await $`age-keygen -o ${keyFile}`.quiet();
  await chmod(keyFile, 0o600);
  console.log(`Generated a new age key at ${keyFile}`);
}
const pub = (await Bun.file(keyFile).text()).match(/public key:\s*(age1[0-9a-z]+)/)?.[1];
if (!pub) die(`Could not read an age public key from ${keyFile}`);

// 3. --sync: just decrypt the existing encrypted file into .dev.vars
if (SYNC) {
  if (!(await Bun.file(ENC).exists())) die(`${ENC} not found - run without --sync first.`);
  await writeDevVars(
    await $`sops --decrypt --input-type dotenv --output-type dotenv ${ENC}`.text(),
  );
  process.exit(0);
}

// 4. Prompt for each secret
const SECRETS: { key: string; desc: string; gen?: () => string; optional?: boolean }[] = [
  {
    key: "CREDENTIAL_ENCRYPTION_KEY",
    desc: "root key for envelope-encrypting user bucket creds",
    gen: () => rand(32),
  },
  { key: "BETTER_AUTH_SECRET", desc: "Better Auth session secret", gen: () => rand(32) },
  { key: "STRIPE_SECRET_KEY", desc: "Stripe secret (sk_test_… locally)" },
  { key: "STRIPE_WEBHOOK_SECRET", desc: "Stripe webhook signing secret (whsec_…)" },
  { key: "GOOGLE_CLIENT_ID", desc: "Google OAuth client id (optional)", optional: true },
  { key: "GOOGLE_CLIENT_SECRET", desc: "Google OAuth client secret (optional)", optional: true },
];

console.log("\nLocal secrets setup. Input is echoed - run in a private terminal.\n");
const lines: string[] = [];
for (const s of SECRETS) {
  const hint = s.gen ? " [enter = auto-generate]" : s.optional ? " [enter = skip]" : "";
  const input = (prompt(`${s.key} - ${s.desc}${hint}:`) ?? "").trim();
  const value = input || (s.gen ? s.gen() : "");
  if (!value && !s.optional) console.warn(`  ! ${s.key} left empty`);
  if (value || !s.optional) lines.push(`${s.key}=${value}`);
}
const plaintext = lines.join("\n") + "\n";

// 5. Encrypt to YOUR key (explicit --age overrides .sops.yaml) via a transient temp file
await mkdir(join(ROOT, "secrets"), { recursive: true });
const tmp = join(tmpdir(), `byos3-local-${rand(6)}.env`);
await Bun.write(tmp, plaintext);
try {
  // --config /dev/null: local files are encrypted to an explicit --age key, so bypass
  // .sops.yaml (whose only rule is for prod) - otherwise sops errors "no matching creation rules".
  const enc =
    await $`sops --encrypt --age ${pub} --config /dev/null --input-type dotenv --output-type dotenv ${tmp}`.text();
  await Bun.write(ENC, enc);
} finally {
  await rm(tmp, { force: true });
}
console.log(`\nWrote ${ENC} (encrypted to ${pub.slice(0, 16)}…, gitignored).`);

// 6. Emit .dev.vars from the plaintext we already have
await writeDevVars(plaintext);
console.log("\nDone. Re-run with --sync after pulling changes to refresh .dev.vars.");

// ── helpers ──────────────────────────────────────────────────────────────────
async function writeDevVars(content: string) {
  const appDir = join(ROOT, "workspaces", "apps", "web");
  const target = (await isDir(appDir)) ? join(appDir, ".dev.vars") : join(ROOT, ".dev.vars");
  await Bun.write(target, content);
  console.log(`Wrote ${target} for \`wrangler dev\`.`);
}
async function isDir(p: string) {
  try {
    return (
      (await Bun.file(join(p, "package.json")).exists()) || (await Bun.file(p).stat()).isDirectory()
    );
  } catch {
    return false;
  }
}
function rand(n: number) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Buffer.from(a).toString("base64url");
}
function die(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}
