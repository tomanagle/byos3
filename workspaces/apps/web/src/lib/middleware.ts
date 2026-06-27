import { createServiceLogger } from "@byos3/logging";
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders, getRequestUrl } from "@tanstack/react-start/server";
import { createServiceContext } from "#/server/ctx";

const { createSpan } = createServiceLogger({ service: "web" });

/**
 * Wide-event logging for server functions - ONE structured JSON event per call, timed start→end via
 * the request span (it stamps `duration_ms` at `end()`). Auto-captures the fn name, path, request
 * id, and outcome/status; handlers enrich it via `context.span.set(...)` and may open child timings
 * with `context.span.span(name)`. NEVER set secrets or presigned URLs. See agents/docs/logging.md.
 */
export const loggingMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const headers = getRequestHeaders();
  const requestId = headers.get("cf-ray") ?? headers.get("x-request-id") ?? crypto.randomUUID();
  const path = getRequestUrl().pathname;
  const fn = path.match(/\/_serverFn\/([^/?]+)/)?.[1];
  const span = createSpan({
    "web.request_id": requestId,
    "web.path": path,
    ...(fn ? { "web.fn": fn } : {}),
  });
  try {
    const result = await next({ context: { span, requestId } });
    span.set({ outcome: "success", status_code: 200 });
    span.end();
    return result;
  } catch (error) {
    span.set({ outcome: "error", status_code: 500 });
    span.setError(error);
    span.end();
    throw error;
  }
});

/**
 * Authentication middleware: resolves the Better Auth session into a `ServiceContext` (the
 * composition root) and the caller's primary `namespaceId`, putting both on the context so handlers
 * never re-resolve them. Throws when unauthenticated. Authorization stays in `@byos3/services`
 * (`assertCan*`); this only proves *who* is calling. See api.md, rbac.md.
 */
export const authMiddleware = createMiddleware({ type: "function" })
  .middleware([loggingMiddleware])
  .server(async ({ next, context }) => {
    const ctx = await createServiceContext(getRequestHeaders());
    if (!ctx) {
      throw new Error("unauthorized");
    }
    // The composition root already resolved the caller's active namespace (creating a personal one
    // if they belonged to none). See server/ctx.ts.
    const namespaceId = ctx.principal.activeNamespaceId ?? null;
    context.span.set({ "user.id": ctx.principal.userId, "namespace.id": namespaceId });
    return next({ context: { ctx, namespaceId } });
  });
