import { defineConfig } from "@playwright/test";

/**
 * Playwright drives the **e2e** suite for byos3 (unit/integration tests stay with their packages,
 * run by bun/vite). These tests exercise real, containerized infrastructure - the MinIO "fake
 * bucket" from `dev/docker-compose.e2e.yml`, brought up/torn down by global setup/teardown.
 *
 * Today the suite is API/storage-level (the presigned, direct-to-bucket transfer path through the
 * `custom` provider). Browser-driven UI flows (Connect → upload → live tree) get added as a second
 * project once the app stack runs in CI; they import the same MinIO fixture.
 */
export default defineConfig({
  testDir: "./specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  projects: [{ name: "storage" }],
});
