import type { D1Database } from "@cloudflare/workers-types";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";

export type Database = DrizzleD1Database<Record<string, never>>;

/**
 * Plain Drizzle/D1 - no session. Use for one-shot scripts, tests, or contexts where replica
 * routing isn't needed.
 */
export function createDb(d1: D1Database): Database {
  return drizzle(d1);
}

/**
 * Drizzle backed by a per-request D1 **Session** (read replication). Reads route to the nearest
 * replica for lower latency while preserving monotonic-read consistency within the session.
 *
 * Create this ONCE per request (or cron tick) and reuse it for that request's lifetime - never at
 * module scope. The composition root (web `ctx.ts`) / `db` middleware (api) own this.
 * @see https://developers.cloudflare.com/d1/best-practices/read-replication/
 */
export function createSessionDb(d1: D1Database): Database {
  // "first-unconstrained": the first query may hit any replica (lowest latency); subsequent reads
  // in the session stay consistent with whatever the session has observed.
  return drizzle(d1.withSession("first-unconstrained") as unknown as D1Database);
}
