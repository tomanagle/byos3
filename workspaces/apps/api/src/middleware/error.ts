import type { ErrorHandler } from "hono";
import { ZodError } from "zod";

import { ApiError, errorToResponse, fromAppError, isAppError } from "@/lib/errors";
import type { ApiContext } from "@/types";

type HttpStatus = 400 | 401 | 403 | 404 | 409 | 429 | 500 | 502;

/**
 * Root error handler (`app.onError`). Converts known errors into the Stripe-shape JSON response:
 * - `ApiError` (transport-level) → as-is
 * - `@byos3/core` `AppError` (thrown by services) → mapped via `fromAppError`
 * - `ZodError` (schema validation) → `validation_failed`
 * - anything else → generic 500 `internal_error`
 * Must be installed via `app.onError(...)`, not as middleware (Hono catches before `await next()`).
 */
export function errorHandler(): ErrorHandler<ApiContext> {
  return (error, c) => {
    const requestId = c.get("requestId");
    const span = c.get("span");

    let apiErr: ApiError | null = null;
    if (error instanceof ApiError) {
      apiErr = error;
    } else if (isAppError(error)) {
      apiErr = fromAppError(error);
    } else if (error instanceof ZodError) {
      const message =
        error.issues
          .map((issue) => {
            const path = issue.path.join(".");
            return path ? `${path}: ${issue.message}` : issue.message;
          })
          .join("; ") || "Invalid request.";
      apiErr = new ApiError({
        type: "invalid_request_error",
        code: "validation_failed",
        message,
        status: 400,
        param: error.issues[0]?.path.join("."),
      });
      span.set("api.error.zod_issue_count", error.issues.length);
    }

    if (apiErr) {
      span.set("api.error.code", apiErr.code);
      return c.json(errorToResponse(apiErr, requestId), apiErr.status as HttpStatus);
    }

    span.setError(error);
    span.set("api.error.code", "internal_error");
    return c.json(errorToResponse(error, requestId), 500);
  };
}
