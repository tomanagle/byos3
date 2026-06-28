import { defineConfig } from "@playwright/test";

/**
 * Playwright drives the byos3 **e2e** suite (unit/integration tests stay with their packages, run by
 * bun/vite). It exercises real infrastructure:
 *   - the MinIO "fake bucket" - part of the LOCAL stack (`dev/docker-compose.yml`); global-setup
 *     ensures it's up (no separate e2e compose) and leaves it running;
 *   - the web app itself, started by the `webServer` below (`bun run dev` → vite + the Cloudflare
 *     plugin's workerd, on :3000). Running the app on the HOST (not in a container) means both the
 *     worker's connectivity probe AND the browser's presigned transfers reach the same MinIO endpoint
 *     (localhost) - no container dual-address problem.
 *
 * The app boots billing-OFF (no Stripe key), which unlocks every feature - so the team/invite flow
 * isn't seat-gated. The web worker needs `ALLOW_PRIVATE_S3_ENDPOINTS=true` to probe the loopback
 * MinIO; global-setup ensures that. Prereqs the runner must satisfy before `bun run e2e`: local
 * secrets (`bun run secrets:setup`) + a migrated local D1 (`db:migrate:local`). CI does both.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // One worker in CI: the specs share a single web app + local D1, so serial keeps state predictable.
  workers: process.env.CI ? 1 : undefined,
  timeout: 60_000,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }], ["list"]]
    : [["list"], ["html", { open: "never" }]],
  // No global teardown: MinIO is part of the local stack (`bun run docker:down` stops it).
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  // Start the web app for the suite (reuse an already-running dev server locally).
  webServer: {
    command: "bun run dev",
    cwd: "../..",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [{ name: "e2e" }],
});
