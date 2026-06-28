#!/usr/bin/env bun
/**
 * Release flow that works with a PROTECTED default branch - no admin bypass needed.
 *
 * `main` requires a PR + green CI, so a release is two steps:
 *
 *   1. bun run release [patch|minor|major]   bump the root package.json on a `release/*` branch and
 *                                            open a PR (CI gates it). NOTHING is pushed to main.
 *   2. <review + merge the PR on GitHub>
 *   3. git switch main && git pull
 *   4. bun run release:tag                   on an up-to-date main, tag v<version> and push the TAG
 *                                            ONLY. A tag push is not a branch push, so it doesn't hit
 *                                            branch protection -> triggers .github/workflows/deploy.yml.
 *
 * Flags: --dry-run (print, change nothing); --skip-checks (skip the local lint/format/build gate in
 * step 1 - the PR's CI still gates the merge). The root package.json version is the single source of
 * truth (the docs site imports it). See agents/docs/deployment.md.
 */
import { $ } from "bun";

const args = Bun.argv.slice(2);
const mode = args[0] === "tag" ? "tag" : "prepare";
const dryRun = args.includes("--dry-run");
const skipChecks = args.includes("--skip-checks");
const PKG = "package.json";

async function assertCleanTree(): Promise<void> {
  const dirty = (await $`git status --porcelain`.text()).trim();
  if (dirty) {
    console.error(`Working tree is not clean - commit or stash first:\n${dirty}`);
    process.exit(1);
  }
}

async function defaultBranch(): Promise<string> {
  const r = await $`git rev-parse --abbrev-ref origin/HEAD`.quiet().nothrow();
  const name =
    r.exitCode === 0
      ? r.stdout
          .toString()
          .trim()
          .replace(/^origin\//, "")
      : "";
  return name && name !== "HEAD" ? name : "main";
}

async function readVersion(): Promise<string> {
  return (await Bun.file(PKG).json()).version ?? "0.0.0";
}

if (mode === "prepare") {
  const bump = (args.find((a) => !a.startsWith("-") && a !== "tag") ?? "patch") as
    | "patch"
    | "minor"
    | "major";
  if (!["patch", "minor", "major"].includes(bump)) {
    console.error(`Invalid bump "${bump}". Use: patch | minor | major (default patch).`);
    process.exit(1);
  }

  const current = await readVersion();
  const [maj, min, pat] = current.split(".").map(Number);
  const next =
    bump === "major"
      ? `${maj + 1}.0.0`
      : bump === "minor"
        ? `${maj}.${min + 1}.0`
        : `${maj}.${min}.${pat + 1}`;
  const branch = `release/v${next}`;

  console.log(`${bump} release: ${current} -> ${next}  (branch ${branch} -> PR)`);
  if (dryRun) {
    console.log("--dry-run: nothing changed, no branch or PR created.");
    process.exit(0);
  }

  await assertCleanTree();
  const exists = await $`git rev-parse --verify ${branch}`.quiet().nothrow();
  if (exists.exitCode === 0) {
    console.error(`Branch ${branch} already exists - delete it or merge its PR first.`);
    process.exit(1);
  }

  if (!skipChecks) {
    console.log("Running gate (lint, format:check, build)…");
    await $`bun run lint`;
    await $`bun run format:check`;
    await $`bun run build`;
  }

  const base = await defaultBranch();
  const start = (await $`git rev-parse --abbrev-ref HEAD`.text()).trim();
  const pkg = await Bun.file(PKG).json();
  pkg.version = next;

  await $`git switch -c ${branch}`;
  await Bun.write(PKG, `${JSON.stringify(pkg, null, 2)}\n`);
  await $`git commit ${PKG} -m ${`release: v${next}`}`;
  await $`git push -u origin ${branch}`;
  await $`git switch ${start}`; // keep main's tree at the old version until the PR merges

  const gh = await $`gh --version`.quiet().nothrow();
  if (gh.exitCode === 0) {
    await $`gh pr create --base ${base} --head ${branch} --title ${`Release v${next}`} --body ${`Bump version to v${next}. Merge, then run \`bun run release:tag\` on an up-to-date ${base} to tag + deploy.`}`;
    console.log(
      `\nPR opened for v${next}. After it merges: git switch ${base} && git pull && bun run release:tag`,
    );
  } else {
    console.log(`\nPushed ${branch}. Open a PR into ${base} and merge it, then:`);
    console.log(`  git switch ${base} && git pull && bun run release:tag`);
  }
} else {
  // tag mode: tag an already-merged version on main and push only the tag.
  await assertCleanTree();
  const base = await defaultBranch();
  await $`git fetch origin --tags`;

  const branch = (await $`git rev-parse --abbrev-ref HEAD`.text()).trim();
  if (branch !== base) {
    console.error(
      `Switch to ${base} first (you're on ${branch}); the release PR must be merged there.`,
    );
    process.exit(1);
  }
  const local = (await $`git rev-parse HEAD`.text()).trim();
  const remote = (await $`git rev-parse origin/${base}`.text()).trim();
  if (local !== remote) {
    console.error(
      `${base} is behind origin/${base} - run \`git pull\` (the release PR must be merged).`,
    );
    process.exit(1);
  }

  const tag = `v${await readVersion()}`;
  const localTag = await $`git rev-parse -q --verify refs/tags/${tag}`.quiet().nothrow();
  const remoteTag = (await $`git ls-remote --tags origin ${tag}`.text()).trim();
  if (localTag.exitCode === 0 || remoteTag.length > 0) {
    console.error(
      `Tag ${tag} already exists. Bump first with \`bun run release\` (open + merge the PR).`,
    );
    process.exit(1);
  }

  console.log(
    `Tagging ${tag} at ${base}@${local.slice(0, 7)} and pushing the tag (deploy trigger).`,
  );
  if (dryRun) {
    console.log("--dry-run: no tag created or pushed.");
    process.exit(0);
  }
  await $`git tag -a ${tag} -m ${tag}`;
  await $`git push origin ${tag}`;
  console.log(`Released ${tag} - the deploy workflow will pick up the tag.`);
}
