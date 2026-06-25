import type { MiddlewareHandler } from "hono";

import type { ApiContext } from "@/types";

export function requestIdMiddleware(): MiddlewareHandler<ApiContext> {
  return async (c, next) => {
    const id = `req_${crypto.randomUUID().replaceAll("-", "")}`;
    c.set("requestId", id);
    await next();
    c.header("X-Request-Id", id);
  };
}
