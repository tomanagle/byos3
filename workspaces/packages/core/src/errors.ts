export type AppErrorCode =
  | "scope_violation"
  | "not_found"
  | "connector_invalid"
  | "forbidden"
  | "invalid_input"
  | "conflict"
  /** A plan entitlement was exceeded (e.g. the free volume cap) - upgrade to proceed. */
  | "limit_exceeded";

/** Typed domain error. Transport edges map `.code` to an HTTP status. */
export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}
