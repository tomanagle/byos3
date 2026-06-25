/* eslint-disable no-await-in-loop -- readiness polling: each tick must observe the previous probe
   before sleeping, so sequential awaits are intentional. */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * MinIO "fake bucket" lifecycle for the e2e suite. Matches the defaults in
 * `dev/docker-compose.e2e.yml`; override via the same env vars. Used by global-setup/teardown and
 * read by specs that talk to the bucket.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const COMPOSE = "dev/docker-compose.e2e.yml";

export const MINIO = {
  port: process.env.MINIO_PORT ?? "9400",
  get endpoint() {
    return process.env.S3_E2E_ENDPOINT ?? `http://localhost:${this.port}`;
  },
  accessKeyId: process.env.MINIO_ROOT_USER ?? "byos3",
  secret: process.env.MINIO_ROOT_PASSWORD ?? "byos3secret",
  bucket: process.env.MINIO_BUCKET ?? "byos3-e2e",
};

function compose(args: string[]): void {
  execFileSync("docker", ["compose", "-f", COMPOSE, ...args], { cwd: repoRoot, stdio: "inherit" });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function startMinio(): Promise<void> {
  compose(["up", "-d"]);
  await waitForHealth();
  await waitForBucket();
}

export function stopMinio(): void {
  execFileSync("docker", ["compose", "-f", COMPOSE, "down", "-v"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
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
