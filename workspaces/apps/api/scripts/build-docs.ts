// Generates static OpenAPI + Scalar docs from the live route schemas.
// Run: `bun run docs:build` (from workspaces/apps/api).
// Output: dist/openapi.json + dist/index.html - publishable to any static host.

// oxlint-disable no-nodejs-modules -- local build script, not the worker runtime
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Import ./app (not ./index) and pull the same spec the worker serves at /openapi.json, so the doc
// config lives in exactly one place.
import { app } from "../src/app";

const API_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST_DIR = resolve(API_ROOT, "dist");

const res = await app.request("/openapi.json");
if (!res.ok) {
  throw new Error(`Failed to fetch OpenAPI spec: ${res.status}`);
}
const spec = await res.json();

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>byos3 API</title>
  </head>
  <body>
    <script id="api-reference" type="application/json">
${JSON.stringify(spec)}
    </script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>
`;

await mkdir(DIST_DIR, { recursive: true });
await writeFile(resolve(DIST_DIR, "openapi.json"), `${JSON.stringify(spec, null, 2)}\n`);
await writeFile(resolve(DIST_DIR, "index.html"), html);

// oxlint-disable-next-line no-console -- intentional build output
console.log(`Docs written to ${DIST_DIR}/`);
