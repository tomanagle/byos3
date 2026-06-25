import { OpenAPIHono } from "@hono/zod-openapi";

import type { ApiContext } from "@/types";

/**
 * Factory for resource module routers.
 *
 * `OpenAPIHono`'s `defaultHook` is per-instance and does NOT inherit when mounted via
 * `app.route(...)`, so every module router installs its own. This centralizes it: validation
 * failures rethrow (as ZodError) so the root `onError` handler converts them into the Stripe-shape
 * `validation_failed` response instead of zod-openapi's raw `{ success, error }` body.
 */
export function createRouter() {
  return new OpenAPIHono<ApiContext>({
    defaultHook: (result) => {
      if (!result.success) {
        throw result.error;
      }
    },
  });
}
