# Dev image for the byos3 Workers. The dev servers run under NODE, not Bun: Wrangler doesn't support
# the Bun runtime, and vite-under-Bun hits a `node:module` incompatibility. So we install the
# workspace with Bun (deterministic via bun.lock) in one stage, then run vite/wrangler under Node.
# This is a dev convenience only — production deploys to Cloudflare via Wrangler (deployment.md).

# ── Stage 1: install deps with Bun (resolves the monorepo + fetches linux-native binaries) ──
FROM oven/bun:1 AS deps
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile

# ── Stage 2: Node runtime. Carry over the Bun-installed node_modules (linux workerd/esbuild/etc.) ──
FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=deps /app /app
EXPOSE 4500 8787
