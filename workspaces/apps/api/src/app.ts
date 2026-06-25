import { OpenAPIHono } from "@hono/zod-openapi";

import { authMiddleware } from "@/middleware/auth";
import { dbMiddleware } from "@/middleware/db";
import { errorHandler } from "@/middleware/error";
import { requestIdMiddleware } from "@/middleware/request-id";
import { spanMiddleware } from "@/middleware/span";
import connectors from "@/modules/connectors/connectors.router";
import volumes from "@/modules/volumes/volumes.router";
import type { ApiContext } from "@/types";

export const app = new OpenAPIHono<ApiContext>();

// ── Middleware chain ──
app.use("*", requestIdMiddleware());
app.use("*", spanMiddleware());
app.use("/v1/*", dbMiddleware());
app.use("/v1/*", authMiddleware());

app.onError(errorHandler());

// ── OpenAPI + docs ──
app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "byos3 API",
    version: "0.1.0",
    description:
      "Bring-your-own-S3 storage. Programmatic access to volumes, connectors, and presigned, " +
      "direct-to-bucket transfers. Anything the web app can do, an API key can do.",
  },
});

app.openAPIRegistry.registerComponent("securitySchemes", "ApiKey", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "byos3_live_*",
  description: "Workspace-scoped API key. Send as `Authorization: Bearer byos3_live_...`.",
});

// Inline Scalar reference for hitting the worker directly (great for local "Try It").
app.get("/docs", (c) =>
  c.html(
    `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>byos3 API</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`,
  ),
);

// ── Public routes ──
app.get("/healthz", (c) => c.body(null, 200));

// ── Resource routes (thin wrappers over @byos3/services) ──
app.route("/", connectors);
app.route("/", volumes);
