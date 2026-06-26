#!/usr/bin/env bun
/**
 * Cut a release. Bumps the version in the ROOT package.json (the single source of truth - the docs
 * site imports it), commits just that file, tags `v<version>`, and pushes the tag - which triggers
 * `.github/workflows/deploy.yml` to deploy web + api + docs.
 *
 *   bun run release            # patch: 0.1.0 -> 0.1.1
 *   bun run release minor      # 0.1.0 -> 0.2.0
 *   bun run release major      # 0.1.0 -> 1.0.0
 *   bun run release --dry-run  # print the next version + actions, change nothing
 *
 * Tags bypass CI (CI runs on PRs / main), so we run the same gate (lint, format, build) here before
 * tagging - a broken tag would deploy broken code. Skip with --skip-checks if you know better.
 * Only package.json is committed, so unrelated working-tree changes are never bundled into a release.
 */
import { $ } from "bun";

const args = Bun.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skipChecks = args.includes("--skip-checks");
const bump = (args.find((a) => !a.startsWith("-")) ?? "patch") as "patch" | "minor" | "major";

if (!["patch", "minor", "major"].includes(bump)) {
  console.error(`Invalid bump "${bump}". Use: patch | minor | major (default patch).`);
  process.exit(1);
}

const pkgPath = "package.json";
const pkg = await Bun.file(pkgPath).json();
const current = pkg.version ?? "0.0.0";
const [major, minor, patch] = current.split(".").map(Number);
const next =
  bump === "major"
    ? `${major + 1}.0.0`
    : bump === "minor"
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;

console.log(`${bump} release: ${current} -> ${next}  (tag v${next})`);

if (dryRun) {
  console.log("--dry-run: no files changed, nothing committed or pushed.");
  process.exit(0);
}

if (!skipChecks) {
  console.log("Running release gate (lint, format:check, build)…");
  await $`bun run lint`;
  await $`bun run format:check`;
  await $`bun run build`;
}

pkg.version = next;
await Bun.write(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

await $`git commit ${pkgPath} -m v${next}`;
await $`git tag -a v${next} -m v${next}`;
await $`git push origin HEAD --follow-tags`;

console.log(`Released v${next} - the deploy workflow will pick up the tag.`);
