#!/usr/bin/env bash
# List unresolved bot review threads across recent merged PRs.
# Usage: audit-bot-feedback.sh [pr-number ...]
# With no args, audits PRs #4–#6 (known backlog).
set -euo pipefail

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
OWNER="${REPO%%/*}"
NAME="${REPO#*/}"

PRS=("$@")
if [[ ${#PRS[@]} -eq 0 ]]; then
  PRS=(4 5 6)
fi

EXIT=0
for PR in "${PRS[@]}"; do
  THREADS=$(gh api graphql -f query="
    query(\$owner: String!, \$name: String!, \$number: Int!) {
      repository(owner: \$owner, name: \$name) {
        pullRequest(number: \$number) {
          title
          state
          reviewThreads(first: 100) {
            nodes { isResolved path comments(first: 1) { nodes { author { login } } } }
          }
        }
      }
    }
  " -f owner="$OWNER" -f name="$NAME" -F number="$PR")

  TITLE=$(echo "$THREADS" | jq -r '.data.repository.pullRequest.title')
  STATE=$(echo "$THREADS" | jq -r '.data.repository.pullRequest.state')
  UNRESOLVED=$(echo "$THREADS" | jq -r '
    [.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length
  ')
  TOTAL=$(echo "$THREADS" | jq -r '.data.repository.pullRequest.reviewThreads.nodes | length')

  echo "PR #${PR} [${STATE}] ${TITLE}"
  echo "  threads: ${TOTAL} total, ${UNRESOLVED} unresolved"
  if [[ "$UNRESOLVED" != "0" ]]; then
    EXIT=1
    echo "$THREADS" | jq -r '
      .data.repository.pullRequest.reviewThreads.nodes[]
      | select(.isResolved == false)
      | "    - \(.path) (\(.comments.nodes[0].author.login // "unknown"))"
    '
  fi
  echo ""
done

if [[ $EXIT -ne 0 ]]; then
  echo "FAIL: unresolved bot review threads remain. Fix code, reply, then run:" >&2
  echo "  .github/scripts/resolve-bot-threads.sh <pr-number>" >&2
fi
exit $EXIT
