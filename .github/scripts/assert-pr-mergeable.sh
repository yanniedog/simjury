#!/usr/bin/env bash
# Fails unless a PR is safe to squash-merge. Delegates to npm pr:gates:check when available.
set -euo pipefail

PR_NUMBER="${1:-}"

if [[ -z "$PR_NUMBER" ]]; then
  echo "Usage: $0 <pr-number>" >&2
  exit 2
fi

echo "Checking merge readiness for PR #${PR_NUMBER}..."

if command -v node >/dev/null 2>&1 && [[ -f package.json ]]; then
  npm run pr:gates:check -- --pr "$PR_NUMBER"
  echo ""
  echo "PR #${PR_NUMBER} passes automated merge preflight."
  echo "Merge with: gh pr merge ${PR_NUMBER} --auto --squash --delete-branch"
  exit 0
fi

# Fallback when Node/npm scripts are unavailable
PR_JSON=$(gh pr view "$PR_NUMBER" --json state,statusCheckRollup)
STATE=$(jq -r '.state' <<< "$PR_JSON")
if [[ "$STATE" != "OPEN" ]]; then
  echo "ERROR: PR #${PR_NUMBER} is not open (state=$STATE)" >&2
  exit 1
fi

for CHECK in validate bot-presence-gate bot-feedback-gate; do
  RESULT=$(jq -r --arg c "$CHECK" '
    .statusCheckRollup[]? | select(.name == $c or .context == $c) | .conclusion // .state
  ' <<< "$PR_JSON" | head -1)
  if [[ "$RESULT" != "SUCCESS" ]]; then
    echo "ERROR: required check '$CHECK' is not SUCCESS (got: ${RESULT:-missing})" >&2
    exit 1
  fi
  echo "OK: $CHECK"
done

echo "PR #${PR_NUMBER} passes fallback merge preflight."
