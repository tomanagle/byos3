// Generates a static OpenAPI + Scalar docs site from the live route schemas.
// Run: `bun run docs:build` (from workspaces/apps/api).
// Output: dist-docs/openapi.json + dist-docs/index.html - served by the byos3-docs static-assets
// Worker at docs.<APP_DOMAIN> (see wrangler.docs.jsonc). Safe to publish to any static host.

// oxlint-disable no-nodejs-modules -- local build script, not the worker runtime
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Import ./app (not ./index) and pull the same spec the worker serves at /openapi.json, so the doc
// config (title, version, description, security schemes) lives in exactly one place: src/app.ts.
import { app } from "../src/app";
// The ROOT package.json version is the single source of truth (bumped by `bun run release`).
import rootPkg from "../../../../package.json";

const API_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST_DIR = resolve(API_ROOT, "dist-docs");

const res = await app.request("/openapi.json");
if (!res.ok) {
  throw new Error(`Failed to fetch OpenAPI spec: ${res.status}`);
}
const spec = (await res.json()) as {
  info?: { version?: string };
  servers?: { url: string; description?: string }[];
};

// Stamp the release version into the published spec so the docs always show what's live. `release`
// bumps package.json and tags v<version>, so the docs + the deploy tag stay in lockstep.
if (rootPkg.version && spec.info) spec.info.version = rootPkg.version;

// The published site lives at docs.<domain> but the API is at api.<domain>, so point the spec's
// `servers` at the real backend - Scalar shows it and sends "Try It" requests there. APP_DOMAIN is
// the deploy var (so a fork gets https://api.<their-domain>); the local docs container overrides the
// whole URL via DOCS_BASE_SERVER_URL so "Try It" hits the local API. This overrides the request-origin
// servers the live Worker sets in src/app.ts.
const apiUrl =
  process.env.DOCS_BASE_SERVER_URL ?? `https://api.${process.env.APP_DOMAIN ?? "byos3.com"}`;
spec.servers = [{ url: apiUrl, description: "byos3 API" }];

// Scalar is loaded from jsDelivr; the spec is inlined as a JSON blob, so the published page is
// self-contained (no backend call needed to render it).
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
