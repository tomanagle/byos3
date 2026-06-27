import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { createServiceContext } from "#/server/ctx";

// The live namespace WebSocket. This MUST be an HTTP route (a WS upgrade can't be a server
// function) - it + the Better Auth handler are the only `routes/api/*` HTTP handlers. The Worker
// authenticates + authorizes here, then forwards the upgrade to the namespace's Durable Object
// (passing the principal it trusts). See agents/docs/sync-engine.md, rbac.md.
export const Route = createFileRoute("/api/ns/socket")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
          return new Response("expected a websocket upgrade", { status: 426 });
        }
        const ctx = await createServiceContext(request.headers);
        if (!ctx) return new Response("unauthorized", { status: 401 });

        // Connect to the caller's active namespace (resolved by createServiceContext).
        const nsId = ctx.principal.activeNamespaceId;
        if (!nsId) return new Response("no namespace", { status: 403 });

        const ns = (env as { NAMESPACE: DurableObjectNamespace }).NAMESPACE;
        const stub = ns.get(ns.idFromName(nsId));

        const headers = new Headers(request.headers);
        headers.set("x-byos3-user", ctx.principal.userId);
        return stub.fetch(new Request(request, { headers }));
      },
    },
  },
});
