import { createRoute } from "@hono/zod-openapi";

import { connectBucket } from "@byos3/services";

import { createRouter } from "@/lib/create-router";
import { jsonError } from "@/schemas/common";

import { ConnectBucketBody, ConnectResultSchema } from "./connectors.schema";

const app = createRouter();

const ConnectRoute = createRoute({
  method: "post",
  path: "/v1/connectors",
  tags: ["Connectors"],
  security: [{ ApiKey: [] }],
  request: {
    body: { required: true, content: { "application/json": { schema: ConnectBucketBody } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ConnectResultSchema } },
      description: "Bucket connected and mounted as a volume",
    },
    400: jsonError("Invalid request"),
    401: jsonError("Unauthenticated"),
    403: jsonError("Missing scope"),
  },
});

// oxlint-disable-next-line jest/require-hook -- registers an OpenAPI route handler, not a test hook
app.openapi(ConnectRoute, async (c) => {
  const result = await connectBucket(c.get("ctx"), c.req.valid("json"));
  // Parse the response too: strips any field not in the schema, so a future change can't silently
  // leak data through this route. The schema is the single contract for both directions.
  return c.json(ConnectResultSchema.parse(result), 200);
});

export default app;
