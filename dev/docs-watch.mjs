// Dev docs builder: builds the static OpenAPI + Scalar site once, writes a ready file (so the docs
// container can start serving), then WATCHES the API source and rebuilds whenever a route/schema
// changes - save a schema edit and the docs site refreshes. The compose `docs` service serves the
// output (dist-docs) with `wrangler dev`, which hot-reloads when the assets change.
//
// Polling (not fs.watch) on purpose: inotify events don't reliably cross Docker bind mounts on macOS.
// The build runs under Bun (it imports the Hono app and resolves the API's `@/` path aliases, which
// plain Node can't); everything else here is Node. See dev/README.md, agents/docs/api.md.
import { spawn } from "node:child_process";
import { readdir, stat, writeFile } from "node:fs/promises";

const API_DIR = "/app/workspaces/apps/api";
const SRC = `${API_DIR}/src`;
const READY = "/tmp/docs-ready";
const POLL_MS = 2000;

function build() {
  return new Promise((resolve) => {
    // DOCS_BASE_SERVER_URL is inherited from the container env so "Try It" targets the local API.
    const child = spawn("bun", ["run", "docs:build"], { cwd: API_DIR, stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 0));
    child.on("error", (err) => {
      console.error("[docs] failed to spawn bun:", err?.message ?? err);
      resolve(1);
    });
  });
}

async function signature(dir) {
  const entries = (await readdir(dir, { withFileTypes: true })).toSorted((a, b) =>
    a.name.localeCompare(b.name),
  );
  const parts = await Promise.all(
    entries.map(async (entry) => {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return signature(full);
      if (!entry.name.endsWith(".ts")) return "";
      const s = await stat(full);
      return `${full}:${s.size}:${Math.floor(s.mtimeMs)}`;
    }),
  );
  return parts.filter(Boolean).join("|");
}

console.log("[docs] building docs site…");
await build();
await writeFile(READY, "ok");
let last = await signature(SRC).catch(() => "");
console.log(`[docs] ready · watching ${SRC} (poll ${POLL_MS}ms)`);

setInterval(async () => {
  try {
    const sig = await signature(SRC);
    if (sig !== last) {
      last = sig;
      console.log("[docs] API source changed → rebuilding docs…");
      await build();
      console.log("[docs] rebuilt.");
    }
  } catch (err) {
    console.error("[docs] poll error:", err?.message ?? err);
  }
}, POLL_MS);
