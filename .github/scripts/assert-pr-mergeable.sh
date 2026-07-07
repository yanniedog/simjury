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

if ! PR_JSON=$(gh pr view "$PR_NUMBER" --json state,mergeable,mergeStateStatus,statusCheckRollup,reviewDecision 2>/dev/null); then
  echo "ERROR: cannot read PR #${PR_NUMBER}" >&2
  exit 1
fi

STATE=$(jq -r '.state' <<< "$PR_JSON")
if [[ "$STATE" != "OPEN" ]]; then
  echo "ERROR: PR #${PR_NUMBER} is not open (state=$STATE)" >&2
  exit 1
fi

# Required status checks (support CheckRun .name and StatusContext .context)
for CHECK in validate bot-review-window; do
  RESULT=$(jq -r --arg c "$CHECK" '
    .statusCheckRollup[]? | select(.name == $c or .context == $c) | .conclusion // .state
  ' <<< "$PR_JSON" | head -1)
  if [[ "$RESULT" != "SUCCESS" ]]; then
    echo "ERROR: required check '$CHECK' is not SUCCESS (got: ${RESULT:-missing})" >&2
    echo "Wait for CI — do not merge until bot-review-window completes." >&2
    exit 1
  fi
  echo "OK: $CHECK"
done

# Inline review comments (informational)
THREADS=$(gh api "repos/{owner}/{repo}/pulls/${PR_NUMBER}/comments" --paginate 2>/dev/null | jq -s 'add // [] | length' || echo 0)
REVIEWS=$(gh api "repos/{owner}/{repo}/pulls/${PR_NUMBER}/reviews" 2>/dev/null | jq 'length' || echo 0)
echo "INFO: inline comments=$THREADS, reviews=$REVIEWS"

# Unresolved review threads (hard gate)
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
OWNER="${REPO%%/*}"
NAME="${REPO#*/}"
UNRESOLVED=$(gh api graphql -f query="
  query(\$owner: String!, \$name: String!, \$number: Int!) {
    repository(owner: \$owner, name: \$name) {
      pullRequest(number: \$number) {
        reviewThreads(first: 100) {
          nodes { isResolved path }
        }
      }
    }
  }
" -f owner="$OWNER" -f name="$NAME" -F number="$PR_NUMBER" | jq -r '
  [.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length
')

if [[ "${UNRESOLVED:-0}" != "0" ]]; then
  echo "ERROR: PR #${PR_NUMBER} has ${UNRESOLVED} unresolved review thread(s)." >&2
  echo "Fix bot feedback, reply on each thread, then run:" >&2
  echo "  .github/scripts/resolve-bot-threads.sh ${PR_NUMBER}" >&2
  exit 1
fi
echo "OK: all review threads resolved"

echo ""
echo "PR #${PR_NUMBER} passes automated merge preflight."
echo "Still required before merge:"
echo "  1. Read all bot review comments and fix or reply"
echo "  2. Resolve every review thread in the GitHub UI"
echo "  3. Only then: gh pr merge ${PR_NUMBER} --squash --delete-branch"
