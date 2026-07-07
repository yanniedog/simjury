#!/usr/bin/env bash
# Operator script: apply main branch protection requiring bot gates.
# Prefer: npm run branch-protection:apply (Node) or ruleset import.
set -euo pipefail

DETECTED_OWNER=""
DETECTED_REPO=""
if [[ -z "${1:-}" || -z "${2:-}" ]]; then
  if CURRENT_REPO=$(gh repo view --json owner,name 2>/dev/null); then
    DETECTED_OWNER=$(echo "$CURRENT_REPO" | jq -r '.owner.login')
    DETECTED_REPO=$(echo "$CURRENT_REPO" | jq -r '.name')
  fi
fi

OWNER="${1:-${DETECTED_OWNER:-yanniedog}}"
REPO="${2:-${DETECTED_REPO:-simjury}}"
BRANCH="${3:-main}"

echo "Applying branch protection to ${OWNER}/${REPO}:${BRANCH}..."

gh api \
  -X PUT \
  "repos/${OWNER}/${REPO}/branches/${BRANCH}/protection" \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "checks": [
      { "context": "validate" },
      { "context": "bot-presence-gate" },
      { "context": "bot-feedback-gate" }
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_linear_history": false,
  "allow_fork_syncing": true
}
EOF

echo ""
echo "Branch protection applied. Required checks: validate, bot-presence-gate, bot-feedback-gate"
echo "Verify at: https://github.com/${OWNER}/${REPO}/settings/branches"
