import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { createAuth } from "@byos3/auth";

// Server-only - imported dynamically inside handlers so `env` is read within a request and never
// reaches the client bundle. The Better Auth config itself lives in @byos3/auth (shared with
// apps/api); this is just the web Worker's composition of it. See agents/docs/auth.md, api.md.

export const auth = createAuth({
  db: drizzle(env.DB),
  secret: (env as { BETTER_AUTH_SECRET?: string }).BETTER_AUTH_SECRET,
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:4322",
    "http://localhost:4323",
    "http://localhost:4324",
    "http://localhost:4325",
  ],
});
