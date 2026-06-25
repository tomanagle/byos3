// Dev migrator: applies D1 migrations to the shared local-D1 volume, then WATCHES the migrations
// directory and re-applies whenever it changes — so saving a new migration auto-applies it to the
// local DB without restarting the stack. `wrangler ... migrations apply` is idempotent (it tracks
// what's already applied), so re-runs only apply the new files.
//
// Polling (not fs.watch) on purpose: inotify events don't reliably cross Docker bind mounts on macOS.
// Runs under Node (Wrangler doesn't support the Bun runtime). See dev/README.md, agents/docs/deployment.md.
import { spawn } from "node:child_process";
import { readdir, stat, writeFile } from "node:fs/promises";

const WEB_DIR = "/app/workspaces/apps/web";
const MIGRATIONS = `${WEB_DIR}/migrations`;
const STATE = "/state";
const READY = "/tmp/migrator-ready";
const POLL_MS = 2000;

function apply() {
  return new Promise((resolve) => {
    const child = spawn(
      "npx",
      ["wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", STATE],
      { cwd: WEB_DIR, stdio: "inherit" },
    );
    child.on("exit", (code) => resolve(code ?? 0));
    child.on("error", (err) => {
      console.error("[migrator] failed to spawn wrangler:", err?.message ?? err);
      resolve(1);
    });
  });
}

async function signature() {
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).toSorted();
  const parts = await Promise.all(
    files.map(async (f) => {
      const s = await stat(`${MIGRATIONS}/${f}`);
      return `${f}:${s.size}:${Math.floor(s.mtimeMs)}`;
    }),
  );
  return parts.join("|");
}

console.log("[migrator] applying migrations…");
await apply();
await writeFile(READY, "ok");
let last = await signature().catch(() => "");
console.log(`[migrator] ready · watching ${MIGRATIONS} (poll ${POLL_MS}ms)`);

setInterval(async () => {
  try {
    const sig = await signature();
    if (sig !== last) {
      last = sig;
      console.log("[migrator] migrations changed → applying…");
      await apply();
      console.log("[migrator] applied.");
    }
  } catch (err) {
    console.error("[migrator] poll error:", err?.message ?? err);
  }
}, POLL_MS);
