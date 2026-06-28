#!/usr/bin/env bash
# Set up branch + tag + environment protection for byos3 via the GitHub API.
#
#   bash dev/setup-branch-protection.sh
#
# Requires: `gh` authenticated with ADMIN on the repo (check `gh auth status`).
#
# IMPORTANT: rulesets on a PRIVATE repo need GitHub Pro/Team/Enterprise. On the Free plan they only
# work once the repo is PUBLIC - so run this right after you flip the repo to public. Re-running is
# safe: existing rulesets are detected and skipped.
#
# What it configures:
#   1. `main`           - require a PR + the `check` CI job; block force-push + deletion. (0 required
#                         approvals, so a solo maintainer can self-merge once CI is green.)
#   2. tags `v*`        - only maintainers (repo admins) may create/delete them - a `v*` tag deploys.
#   3. `production` env - deployments restricted to `v*` tags, matching the deploy workflow.
#
# Admins keep bypass as a safety valve; the normal release flow (PR bump -> merge -> tag) never needs
# it. See agents/docs/deployment.md.
set -euo pipefail

REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
echo "Configuring protection for $REPO"

# RepositoryRole 5 = admin. Admins can bypass (emergency fixes); releases don't rely on it.
BYPASS='[{"actor_id":5,"actor_type":"RepositoryRole","bypass_mode":"always"}]'

ruleset_id() { gh api "repos/$REPO/rulesets" --jq ".[] | select(.name==\"$1\") | .id" 2>/dev/null || true; }

# 1) main: PR required + status check, no force-push, no deletion ----------------------------------
if [ -z "$(ruleset_id 'main protection')" ]; then
  gh api --method POST "repos/$REPO/rulesets" --input - >/dev/null <<JSON
{
  "name": "main protection",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": $BYPASS,
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["squash", "merge", "rebase"]
    } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [ { "context": "check" } ]
    } }
  ]
}
JSON
  echo "✓ created ruleset 'main protection'"
else
  echo "• 'main protection' already exists - skipping"
fi

# 2) v* tags: only maintainers may create/delete them ----------------------------------------------
if [ -z "$(ruleset_id 'release tags')" ]; then
  gh api --method POST "repos/$REPO/rulesets" --input - >/dev/null <<JSON
{
  "name": "release tags",
  "target": "tag",
  "enforcement": "active",
  "bypass_actors": $BYPASS,
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "rules": [ { "type": "creation" }, { "type": "deletion" }, { "type": "non_fast_forward" } ]
}
JSON
  echo "✓ created ruleset 'release tags'"
else
  echo "• 'release tags' already exists - skipping"
fi

# 3) production environment: only v* tags can deploy -----------------------------------------------
gh api --method PUT "repos/$REPO/environments/production" --input - >/dev/null <<'JSON'
{ "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true } }
JSON
if gh api "repos/$REPO/environments/production/deployment-branch-policies" \
    --jq '.branch_policies[].name' 2>/dev/null | grep -qx 'v*'; then
  echo "• production env tag policy 'v*' already exists - skipping"
else
  gh api --method POST "repos/$REPO/environments/production/deployment-branch-policies" \
    -f name='v*' -f type=tag >/dev/null
  echo "✓ restricted production env to v* tags"
fi

echo "Done. Review at: https://github.com/$REPO/settings/rules"
