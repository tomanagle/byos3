import { AppError } from "@byos3/core";

/** Stripe-shaped error vocabulary for the public API. */
export const API_ERROR_CODES = [
  "authentication_required",
  "invalid_api_key",
  "missing_scope",
  "validation_failed",
  "not_found",
  "conflict",
  "scope_violation",
  "provider_error",
  "internal_error",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiErrorType =
  | "authentication_error"
  | "permission_error"
  | "invalid_request_error"
  | "not_found_error"
  | "conflict_error"
  | "rate_limit_error"
  | "api_error";

export class ApiError extends Error {
  readonly type: ApiErrorType;
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly param: string | undefined;

  constructor(args: {
    type: ApiErrorType;
    code: ApiErrorCode;
    message: string;
    status: number;
    param?: string;
  }) {
    super(args.message);
    this.name = "ApiError";
    this.type = args.type;
    this.code = args.code;
    this.status = args.status;
    this.param = args.param;
  }
}

export interface ErrorBody {
  error: {
    type: ApiErrorType;
    code: ApiErrorCode;
    message: string;
    param?: string;
    docUrl?: string;
    requestId: string;
  };
}

/** Map a thrown `@byos3/core` AppError onto the public API error shape. */
export function fromAppError(err: AppError): ApiError {
  switch (err.code) {
    case "forbidden":
      return new ApiError({
        type: "permission_error",
        code: "missing_scope",
        message: err.message,
        status: 403,
      });
    case "not_found":
      return new ApiError({
        type: "not_found_error",
        code: "not_found",
        message: err.message,
        status: 404,
      });
    case "scope_violation":
      return new ApiError({
        type: "invalid_request_error",
        code: "scope_violation",
        message: err.message,
        status: 400,
      });
    case "conflict":
      return new ApiError({
        type: "conflict_error",
        code: "conflict",
        message: err.message,
        status: 409,
      });
    case "provider_error":
      return new ApiError({
        type: "api_error",
        code: "provider_error",
        message: err.message,
        status: 502,
      });
    default:
      return new ApiError({
        type: "api_error",
        code: "internal_error",
        message: "An unexpected error occurred.",
        status: 500,
      });
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function errorToResponse(err: unknown, requestId: string): ErrorBody {
  if (err instanceof ApiError) {
    return {
      error: { type: err.type, code: err.code, message: err.message, param: err.param, requestId },
    };
  }
  return {
    error: {
      type: "api_error",
      code: "internal_error",
      message: "An unexpected error occurred.",
      requestId,
    },
  };
}
