export type AppErrorCode =
  | "scope_violation"
  | "not_found"
  | "connector_invalid"
  | "forbidden"
  | "invalid_input"
  | "conflict";

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
