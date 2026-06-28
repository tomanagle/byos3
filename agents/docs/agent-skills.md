# Agent Skills (shipped with the packages via TanStack Intent)

byos3 ships **Agent Skills** - `SKILL.md` files that teach AI coding agents how to use each package
correctly - *inside the npm packages themselves*, using **[`@tanstack/intent`](https://tanstack.com/intent)**.
The point: an agent's knowledge of byos3 travels with the package version it has installed, instead
of depending on a model's training cutoff. Update a package → the new version brings updated skills.

This complements the `byos3-docs` router skill and the normative `agents/docs/` tree: `agents/docs/*`
is the source of truth; each `SKILL.md` is a **distilled, versioned, doc-referenced** view of it for
agents, with a CI **stale check** that flags a skill when its source doc drifts.

## Where skills live

Per-package, monorepo layout (Intent's convention):

```
workspaces/packages/<pkg>/skills/<skill>/SKILL.md
```

Authored set today (all `type: core`):

| Package | Skill | Covers |
|---|---|---|
| `@byos3/s3` | `storage-core` | StorageDriver port, presign, capability flags, path-style, bytes-never-through-Worker |
| `@byos3/services` | `use-cases` | one-core-two-transports, `ServiceContext`, `assertCan`, thin transports, no dynamic imports |
| `@byos3/core` | `authz` | roles, `createAccessControl`, `authorize`, deny-by-default, role ∩ keyScopes |
| `@byos3/crypto` | `credential-vault` | envelope `seal`/`open`, the sealed-credential capability |
| `@byos3/auth` | `better-auth` | `createAuth`, the `@better-auth/api-key` gotchas, session vs Bearer |

(Still to author: `db`, `protocol`, `logging`, `ui`.)

## SKILL.md contract (what `intent validate` enforces)

- Top-level frontmatter is Agent-Skills-spec-legal: `name`, `description`, optionally `metadata`,
  `sources`, `requires`, `license`. Intent scalars (`type`, `library`, `library_version`) go under
  **`metadata`**, never at the top level.
- `name` = the skill's leaf directory; `description` is a dense, agent-facing routing key.
- `sources` are `Owner/repo:path` references to the normative docs the skill is distilled from
  (e.g. `tomanagle/byos3:agents/docs/storage-byo-s3.md`). These power the stale check.
- Body: **Setup** → **Core Patterns** → **Common Mistakes** (≥3, each plausible/silent/grounded with a
  wrong→correct pair and a `Source:`). Under 500 lines.

## Discovery, versioning, and how skills travel with npm

- Each package is marked with the `tanstack-intent` keyword and ships `skills/` via `files` (added by
  `intent edit-package-json`), plus a `repository` field with `directory` so sources resolve. A
  consumer who `npm i`s the package gets the `SKILL.md` in `node_modules`, and `intent install` wires
  it into their agent config. `intent list` is the **registry** (discovers skills across the
  workspace *and* `node_modules` - incl. skills shipped by our own deps like `@tanstack/react-start`).
- **Versioning:** a skill targets a `metadata.library_version`; it ships in the package tarball and
  versions with the package. **Skill history = the package's git/release history.**

## Maintainer workflow

```bash
bun run skills:scaffold   # prints Intent's 3-step authoring prompt (domain-discovery → tree → generate)
bun run skills:validate   # frontmatter + structure (also runs in CI)
bun run skills:stale      # flag skills whose source docs drifted since the targeted version (CI gate)
bun run skills:list       # the registry: every intent-enabled package + its skills
```

- **Adding a skill:** author `workspaces/packages/<pkg>/skills/<skill>/SKILL.md`, then
  `cd` into the package and run `npx @tanstack/intent edit-package-json`; ensure `@tanstack/intent`
  is a devDependency.
- **When a referenced doc changes:** regenerate the skill, bump `metadata.library_version`, and commit
  - otherwise CI's `intent stale` step flags it.

CI runs `intent validate` + `intent stale` (see `.github/workflows/lint.yml`). The skills are authored
from `agents/docs/*`, so **change behavior → update the doc → regenerate the skill** in the same change.
