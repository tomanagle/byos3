/* eslint-disable no-await-in-loop -- readiness polling: each tick must observe the previous probe
   before sleeping, so sequential awaits are intentional. */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * MinIO "fake bucket" for the e2e suite. It is part of the LOCAL stack (`dev/docker-compose.yml`) -
 * there's no separate e2e compose - so global-setup just brings up the `minio` + `createbucket`
 * services (idempotent; a no-op if `bun run docker:up` already started them), and never tears the
 * local stack down. Override the defaults via the same env vars the compose reads.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const COMPOSE = "dev/docker-compose.yml";

export const MINIO = {
  port: process.env.MINIO_PORT ?? "9400",
  get endpoint() {
    return process.env.S3_E2E_ENDPOINT ?? `http://localhost:${this.port}`;
  },
  accessKeyId: process.env.MINIO_ROOT_USER ?? "byos3",
  secret: process.env.MINIO_ROOT_PASSWORD ?? "byos3secret",
  bucket: process.env.MINIO_BUCKET ?? "byos3-e2e",
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Ensure the local stack's MinIO + bucket are up (only those two services - not the whole stack). */
export async function startMinio(): Promise<void> {
  execFileSync("docker", ["compose", "-f", COMPOSE, "up", "-d", "minio", "createbucket"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  await waitForHealth();
  await waitForBucket();
}

async function waitForHealth(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${MINIO.endpoint}/minio/health/live`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await sleep(1000);
  }
  throw new Error(`MinIO not reachable at ${MINIO.endpoint} within ${timeoutMs}ms`);
}

async function waitForBucket(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const out = execFileSync(
      "docker",
      ["compose", "-f", COMPOSE, "ps", "-a", "--format", "json", "createbucket"],
      { cwd: repoRoot, encoding: "utf8" },
    );
    const lines = out.trim().split("\n").filter(Boolean);
    const last = lines[lines.length - 1];
    if (last) {
      const c = JSON.parse(last) as { State?: string; ExitCode?: number };
      if (c.State === "exited" && c.ExitCode === 0) return;
      if (c.State === "exited" && c.ExitCode !== 0) {
        throw new Error(`bucket creator failed (exit ${c.ExitCode})`);
      }
    }
    await sleep(1000);
  }
  throw new Error("bucket creator did not finish in time");
}
