#!/usr/bin/env bash
# Resolve all open review threads on a PR (after fixes are pushed).
# Usage: resolve-bot-threads.sh <pr-number> [--dry-run]
set -euo pipefail

PR_NUMBER="${1:-}"
DRY_RUN=false
if [[ "${2:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

if [[ -z "$PR_NUMBER" ]]; then
  echo "Usage: $0 <pr-number> [--dry-run]" >&2
  exit 2
fi

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
OWNER="${REPO%%/*}"
NAME="${REPO#*/}"

echo "Fetching unresolved review threads for ${REPO}#${PR_NUMBER}..."

THREADS_JSON=$(gh api graphql -f query="
  query(\$owner: String!, \$name: String!, \$number: Int!) {
    repository(owner: \$owner, name: \$name) {
      pullRequest(number: \$number) {
        reviewThreads(first: 100) {
          nodes { id isResolved path }
        }
      }
    }
  }
" -f owner="$OWNER" -f name="$NAME" -F number="$PR_NUMBER")

UNRESOLVED=$(echo "$THREADS_JSON" | jq -r '
  .data.repository.pullRequest.reviewThreads.nodes[]
  | select(.isResolved == false)
  | .id
')

if [[ -z "$UNRESOLVED" ]]; then
  echo "OK: no unresolved review threads on PR #${PR_NUMBER}"
  exit 0
fi

COUNT=$(echo "$UNRESOLVED" | wc -l | tr -d ' ')
echo "Found ${COUNT} unresolved thread(s)."

while IFS= read -r THREAD_ID; do
  [[ -z "$THREAD_ID" ]] && continue
  PATH_HINT=$(echo "$THREADS_JSON" | jq -r --arg id "$THREAD_ID" '
    .data.repository.pullRequest.reviewThreads.nodes[]
    | select(.id == $id) | .path
  ')
  if [[ "$DRY_RUN" == true ]]; then
    echo "DRY-RUN: would resolve thread $THREAD_ID ($PATH_HINT)"
    continue
  fi
  gh api graphql -f query="
    mutation(\$threadId: ID!) {
      resolveReviewThread(input: { threadId: \$threadId }) {
        thread { isResolved }
      }
    }
  " -f threadId="$THREAD_ID" >/dev/null
  echo "Resolved: $PATH_HINT"
done <<< "$UNRESOLVED"

echo "Done. All review threads on PR #${PR_NUMBER} are resolved."
