import { createSessionDb } from "@byos3/db";
import type { MiddlewareHandler } from "hono";

import type { ApiContext } from "@/types";

/**
 * Mounts a per-request Drizzle/D1 instance - backed by a D1 **Session** so reads route to the
 * nearest replica with monotonic-read consistency for the whole request. Auth + every handler read
 * it via `c.get("db")`. Mount before any middleware that needs DB access (auth, handlers).
 */
export function dbMiddleware(): MiddlewareHandler<ApiContext> {
  return async (c, next) => {
    c.set("db", createSessionDb(c.env.DB));
    await next();
  };
}
