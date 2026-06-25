import type { D1Database } from "@cloudflare/workers-types";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { Span } from "@byos3/logging";
import type { ServiceContext } from "@byos3/services";

export type { Span };

export interface ApiEnv {
  DB: D1Database;
  CREDENTIAL_ENCRYPTION_KEY: string;
  BETTER_AUTH_SECRET?: string;
}

export type Db = DrizzleD1Database<Record<string, never>>;

/**
 * Hono context variables.
 * `requestId`, `span`, `db` are set by the root middleware chain (all routes).
 * The auth middleware (mounted on `/v1/*`) adds `ctx` (the authenticated ServiceContext) and
 * `scopes` (the API key's permissions, or null = unrestricted). See agents/docs/api.md.
 */
export interface ApiContextVars {
  requestId: string;
  span: Span;
  db: Db;
  ctx: ServiceContext;
  scopes: Record<string, string[]> | null;
}

export interface ApiContext {
  Bindings: ApiEnv;
  Variables: ApiContextVars;
}
