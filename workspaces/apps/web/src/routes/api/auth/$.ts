import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/server/auth";

// Mounts Better Auth at /api/auth/* (sign-up, sign-in, organization, etc.). This route is a
// `server.handlers`-only module, so its server-only imports (auth → cloudflare:workers) are kept
// out of the client bundle by the TanStack Start plugin.
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
});
