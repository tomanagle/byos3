import type { MiddlewareHandler } from "hono";

import { createServiceLogger } from "@byos3/logging";

import type { ApiContext } from "@/types";

const logger = createServiceLogger({ service: "byos3-api" });

/**
 * One wide event per request, modelled as the request's root span: method/path/status/request_id/
 * duration + whatever handlers add via `c.get("span").set(...)`. Handlers may open child timings
 * with `c.get("span").span(name)`. The root span flushes the single JSON line at `end()`.
 */
export function spanMiddleware(): MiddlewareHandler<ApiContext> {
  return async (c, next) => {
    const span = logger.createSpan({ "api.method": c.req.method, "api.path": c.req.path });
    c.set("span", span);
    try {
      await next();
      span.set("api.status", c.res.status);
    } finally {
      span.set("api.request_id", c.get("requestId"));
      span.end();
    }
  };
}
