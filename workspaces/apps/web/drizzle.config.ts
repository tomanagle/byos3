import { defineConfig } from "drizzle-kit";

// Migrations are applied to D1 via `wrangler d1 migrations apply DB` (see package.json scripts).
// This config is for `drizzle-kit generate` when evolving the schema.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
});
