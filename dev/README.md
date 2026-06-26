# dev/ - containerized local stack

Runs both Workers in Docker, sharing one local-D1 volume.

```bash
bun run docker:up       # build + start web + api + docs in the background (detached)
bun run docker:rebuild  # after a dependency change: rebuild image + refresh node_modules (keeps D1)
bun run docker:logs     # follow all service logs (web + api + docs + migrator)
bun run docker:down     # stop + remove containers (keeps the D1 volume)
bun run docker:nuke     # remove containers, the D1 volume, and the built image
```

- **web** → http://localhost:4500 (TanStack Start, `vite dev`)
- **api** → http://localhost:8788 (Hono, `wrangler dev` / workerd)
- **docs** → http://localhost:8789 (static OpenAPI + Scalar reference - mirrors `docs.<domain>`)

Host ports default to **4500 / 8788 / 8789** (port 3000 is taken on some machines). Override with
`WEB_PORT=4000 API_PORT=9000 DOCS_PORT=9001 bun run docker:up`.

Both Workers bind the **same** local D1 (a shared volume), so data created on the web app is visible
to the API - mirroring production, where they bind the same D1 database.

**Auto-migrations:** a `migrator` service applies migrations to that volume on startup, then watches
the migrations dir (bind-mounted from the host) and **re-applies whenever it changes** - save a new
migration file and it's applied to the local D1 automatically (no restart). web/api wait for the
migrator to finish its first apply before starting.

**HMR / live reload:** the host repo is bind-mounted at `/app`, so vite (web) and wrangler (api) see
your edits live. `node_modules` is masked by a named volume so the container keeps its own
linux-native install (the host's macOS `node_modules` would break workerd/esbuild). Vite runs with
`CHOKIDAR_USEPOLLING=true` because file-watch events don't cross the macOS Docker bind. **Caveat:**
the `node_modules` volume is NOT refreshed by a plain `--build` (the existing volume masks the new
image). After changing dependencies, run **`bun run docker:rebuild`** (`up --build --renew-anon-volumes`)
to rebuild the image and repopulate `node_modules` while keeping your local D1 data.

**API docs:** the `docs` service builds the static Scalar reference from the API's own OpenAPI spec
(`bun run docs:build` → `dist-docs/`) and serves it with `wrangler dev` - the same
`wrangler.docs.jsonc` static-assets Worker that runs at `docs.<domain>` in prod. A watcher
(`docs-watch.mjs`) rebuilds it whenever the API route schemas change. Scalar's "Try It" is pointed at
the local API (`DOCS_BASE_SERVER_URL=http://localhost:${API_PORT:-8788}`). The docs build runs under
**Bun** (it imports the Hono app to resolve the API's `@/` path aliases, which Node can't) while the
server still runs under Node; the image carries both. The docs service needs no DB, so it starts on
its own without waiting for the migrator.

**Runtime:** the servers run under **Node**, not Bun - Wrangler doesn't support the Bun runtime, and
vite-under-Bun hits a `node:module` incompatibility. Deps are still installed with Bun (`bun.lock`);
only the dev servers run under Node.

This is a dev convenience only - production deploys to Cloudflare via Wrangler (see
`agents/docs/deployment.md`), never as containers.

## e2e tests (Playwright + a real S3-compatible fake bucket)

The **e2e** suite lives in `workspaces/tests` and runs under **Playwright** (unit/integration tests
stay with their packages, run by bun/vite). `docker-compose.e2e.yml` is a separate, minimal stack -
a **MinIO** server + a one-shot bucket-creator - that the suite brings up/tears down automatically
(Playwright `global-setup.ts` / `global-teardown.ts`).

```bash
bun run e2e          # global-setup ups MinIO → Playwright specs → global-teardown downs it
bun run e2e:up        # just start MinIO (e.g. to connect from the web app)
bun run e2e:down      # stop + remove it (and its volume)
E2E_KEEP=1 bun run e2e # run the suite but leave MinIO up afterwards
```

The flagship spec (`workspaces/tests/specs/storage-round-trip.spec.ts`) mounts MinIO via the
**`custom`** provider and runs a presigned PUT→HEAD→GET→list→DELETE round-trip - the real
direct-to-bucket transfer path (bytes never touch the worker). With `e2e:up` you can also mount it
from the web app's **Connect** dialog as a **Custom S3** volume:

> endpoint `http://localhost:9400` · key `byos3` · secret `byos3secret` · bucket `byos3-e2e`

Host ports default to **9400 / 9401** (9000/9001 are often taken - e.g. by OrbStack). Override with
`MINIO_PORT` / `MINIO_CONSOLE_PORT`; creds/bucket via `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` /
`MINIO_BUCKET`. Playwright runs Node-side, so e2e specs work in CI containers and the Playwright
Docker image.
