// Custom Worker entry: the TanStack Start request handler PLUS the Namespace Durable Object class
// (Workers requires the DO class to be exported from the entry the binding points at). wrangler.jsonc
// `main` → this file. See agents/docs/monorepo.md, sync-engine.md.
import handler from "@tanstack/react-start/server-entry";

export { Namespace } from "./server/namespace-do";

export default handler;
