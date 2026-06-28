import { createRoute } from "@hono/zod-openapi";

import { downloadUrl, listVolumes, uploadIntent } from "@byos3/services";

import { createRouter } from "@/lib/create-router";
import { jsonError, listSchema } from "@/schemas/common";

import {
  DownloadQuery,
  PresignedRequestSchema,
  UploadIntentBody,
  VolumeIdParam,
  VolumeSchema,
} from "./volumes.schema";
import { serializeVolume } from "./volumes.serializer";

const app = createRouter();

// Response envelopes parsed before returning, so the schema is enforced (not just documented) and
// no field outside it can leak. Built once and reused per route.
const VolumeListSchema = listSchema(VolumeSchema, "VolumeList");

const ListRoute = createRoute({
  method: "get",
  path: "/v1/volumes",
  tags: ["Volumes"],
  security: [{ ApiKey: [] }],
  responses: {
    200: {
      content: { "application/json": { schema: VolumeListSchema } },
      description: "Mounted volumes",
    },
    401: jsonError("Unauthenticated"),
    403: jsonError("Missing scope"),
  },
});

// oxlint-disable-next-line jest/require-hook -- registers an OpenAPI route handler, not a test hook
app.openapi(ListRoute, async (c) => {
  const volumes = await listVolumes(c.get("ctx"));
  return c.json(
    VolumeListSchema.parse({
      object: "list" as const,
      data: volumes.map(serializeVolume),
      has_more: false,
      next_cursor: null,
    }),
    200,
  );
});

const UploadIntentRoute = createRoute({
  method: "post",
  path: "/v1/volumes/{id}/upload-intent",
  tags: ["Volumes"],
  security: [{ ApiKey: [] }],
  request: {
    params: VolumeIdParam,
    body: { required: true, content: { "application/json": { schema: UploadIntentBody } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: PresignedRequestSchema } },
      description: "Presigned PUT - upload the chunk directly to the bucket",
    },
    400: jsonError("Invalid request"),
    401: jsonError("Unauthenticated"),
    403: jsonError("Missing scope"),
    404: jsonError("Volume not found"),
  },
});

// oxlint-disable-next-line jest/require-hook -- registers an OpenAPI route handler, not a test hook
app.openapi(UploadIntentRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const presigned = await uploadIntent(c.get("ctx"), {
    volumeId: id,
    hash: body.hash,
    expiresIn: body.expiresIn,
  });
  return c.json(PresignedRequestSchema.parse(presigned), 200);
});

const DownloadRoute = createRoute({
  method: "get",
  path: "/v1/volumes/{id}/download-url",
  tags: ["Volumes"],
  security: [{ ApiKey: [] }],
  request: { params: VolumeIdParam, query: DownloadQuery },
  responses: {
    200: {
      content: { "application/json": { schema: PresignedRequestSchema } },
      description: "Presigned GET",
    },
    401: jsonError("Unauthenticated"),
    403: jsonError("Missing scope"),
    404: jsonError("Volume not found"),
  },
});

// oxlint-disable-next-line jest/require-hook -- registers an OpenAPI route handler, not a test hook
app.openapi(DownloadRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { hash } = c.req.valid("query");
  const presigned = await downloadUrl(c.get("ctx"), { volumeId: id, hash });
  return c.json(PresignedRequestSchema.parse(presigned), 200);
});

export default app;
