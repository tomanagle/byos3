import { z } from "@hono/zod-openapi";

import { API_ERROR_CODES } from "@/lib/errors";

export const TimestampSchema = z.string().datetime({ offset: true });

export const ErrorSchema = z
  .object({
    error: z.object({
      type: z.enum([
        "authentication_error",
        "permission_error",
        "invalid_request_error",
        "not_found_error",
        "conflict_error",
        "rate_limit_error",
        "api_error",
      ]),
      code: z.enum(API_ERROR_CODES as unknown as [string, ...string[]]),
      message: z.string(),
      param: z.string().optional(),
      docUrl: z.string().optional(),
      requestId: z.string(),
    }),
  })
  .openapi("Error");

/** A reusable `responses` entry for the Stripe-shape error body. */
export function jsonError(description: string) {
  return { content: { "application/json": { schema: ErrorSchema } }, description };
}

/** Stripe-style envelope for unpaginated collections. */
export function listSchema<T extends z.ZodTypeAny>(item: T, name: string) {
  return z
    .object({
      object: z.literal("list"),
      data: z.array(item),
      has_more: z.boolean(),
      next_cursor: z.string().nullable(),
    })
    .openapi(name);
}
