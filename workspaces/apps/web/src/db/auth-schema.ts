// Better Auth tables now live in the shared @byos3/db package (used by both Workers). This shim
// keeps existing `#/db/auth-schema` imports working. See agents/docs/monorepo.md.
export * from "@byos3/db/auth-schema";
