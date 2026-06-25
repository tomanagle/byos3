import { expect, test } from "bun:test";

import { app } from "../src/app";

// The OpenAPI spec is generated from the same zod schemas that validate requests. This guards that
// the generation works and the surface stays as documented. See agents/docs/api.md.

async function spec(): Promise<Record<string, unknown>> {
  const res = await app.request("/openapi.json");
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

test("serves an OpenAPI 3.1 document", async () => {
  const doc = await spec();
  expect(doc.openapi).toBe("3.1.0");
  expect((doc.info as { title: string }).title).toBe("byos3 API");
});

test("documents every resource path", async () => {
  const paths = Object.keys((await spec()).paths as Record<string, unknown>).toSorted();
  expect(paths).toEqual([
    "/v1/connectors",
    "/v1/volumes",
    "/v1/volumes/{id}/download-url",
    "/v1/volumes/{id}/upload-intent",
  ]);
});

test("registers the ApiKey bearer security scheme + named schemas", async () => {
  const doc = await spec();
  const components = doc.components as {
    securitySchemes: Record<string, { scheme: string }>;
    schemas: Record<string, unknown>;
  };
  expect(components.securitySchemes.ApiKey.scheme).toBe("bearer");
  // Schemas registered via `.openapi(name)` show up as reusable components.
  for (const name of [
    "ConnectBucketInput",
    "ConnectResult",
    "Volume",
    "PresignedRequest",
    "Error",
  ]) {
    expect(components.schemas[name]).toBeDefined();
  }
});
