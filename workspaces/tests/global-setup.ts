import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MINIO, startMinio } from "./minio";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB_DEV_VARS = resolve(repoRoot, "workspaces/apps/web/.dev.vars");

/**
 * The web worker blocks private/loopback S3 endpoints by default (SSRF guard). The e2e bucket is
 * `localhost`, so the worker must run with `ALLOW_PRIVATE_S3_ENDPOINTS=true` - mirroring a self-hosted
 * deploy. Inject it into the web `.dev.vars` BEFORE the `webServer` boots (global setup runs first).
 */
function ensureAllowPrivateEndpoints(): void {
  if (!existsSync(WEB_DEV_VARS)) {
    // eslint-disable-next-line no-console
    console.warn(`▸ e2e: ${WEB_DEV_VARS} missing - run \`bun run secrets:setup\` before e2e.`);
    return;
  }
  const body = readFileSync(WEB_DEV_VARS, "utf8");
  if (/^ALLOW_PRIVATE_S3_ENDPOINTS=/m.test(body)) return;
  appendFileSync(
    WEB_DEV_VARS,
    `${body.endsWith("\n") ? "" : "\n"}ALLOW_PRIVATE_S3_ENDPOINTS=true\n`,
  );
  // eslint-disable-next-line no-console
  console.log("▸ e2e: enabled ALLOW_PRIVATE_S3_ENDPOINTS for the MinIO loopback probe");
}

/** Bring up the MinIO fake bucket before the e2e suite and expose its endpoint to the specs. */
export default async function globalSetup(): Promise<void> {
  ensureAllowPrivateEndpoints();
  await startMinio();
  process.env.S3_E2E_ENDPOINT = MINIO.endpoint;
  // eslint-disable-next-line no-console
  console.log(`\n▸ e2e: MinIO ready at ${MINIO.endpoint} (bucket ${MINIO.bucket})\n`);
}
