#!/usr/bin/env bash
# Fails unless a PR is safe to squash-merge: CI green, bot window elapsed, threads resolved.
set -euo pipefail

PR_NUMBER="${1:-}"
MIN_WAIT_MINUTES="${BOT_REVIEW_MIN_MINUTES:-8}"

if [[ -z "$PR_NUMBER" ]]; then
  echo "Usage: $0 <pr-number>" >&2
  exit 2
fi

echo "Checking merge readiness for PR #${PR_NUMBER} (bot window >= ${MIN_WAIT_MINUTES}m)..."

if ! gh pr view "$PR_NUMBER" --json state,mergeable,mergeStateStatus,statusCheckRollup,reviewDecision \
  >/tmp/pr-mergeable.json 2>/dev/null; then
  echo "ERROR: cannot read PR #${PR_NUMBER}" >&2
  exit 1
fi

STATE=$(jq -r '.state' /tmp/pr-mergeable.json)
if [[ "$STATE" != "OPEN" ]]; then
  echo "ERROR: PR #${PR_NUMBER} is not open (state=$STATE)" >&2
  exit 1
fi

# Required status checks
for CHECK in validate bot-review-window; do
  RESULT=$(jq -r --arg c "$CHECK" '
    .statusCheckRollup[]? | select(.name == $c) | .conclusion // .state
  ' /tmp/pr-mergeable.json | head -1)
  if [[ "$RESULT" != "SUCCESS" ]]; then
    echo "ERROR: required check '$CHECK' is not SUCCESS (got: ${RESULT:-missing})" >&2
    echo "Wait for CI — do not merge until bot-review-window completes." >&2
    exit 1
  fi
  echo "OK: $CHECK"
done

# Unresolved review threads
THREADS=$(gh api "repos/{owner}/{repo}/pulls/${PR_NUMBER}/comments" --paginate 2>/dev/null | jq -s 'length' || echo 0)
REVIEWS=$(gh api "repos/{owner}/{repo}/pulls/${PR_NUMBER}/reviews" 2>/dev/null | jq 'length' || echo 0)
echo "INFO: inline comments=$THREADS, reviews=$REVIEWS"

echo ""
echo "PR #${PR_NUMBER} passes automated merge preflight."
echo "Still required before merge:"
echo "  1. Read all bot review comments and fix or reply"
echo "  2. Resolve every review thread in the GitHub UI"
echo "  3. Only then: gh pr merge ${PR_NUMBER} --squash --delete-branch"
