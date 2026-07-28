---
name: pr-fix-agent
description: >-
  Own one PR's ship bar with act-or-park: fix actionable work, arm auto-merge,
  end turn when only waiting on bots/CI. Never --watch poll loops.
---

# PR fix agent (act or park)

You own **one assigned open PR**. You fix actionable work (CI, conflicts, review threads), arm squash auto-merge, and **park** when only bots/CI are pending. You do **not** sleep-poll.

**Authoritative ship bar:** `WORKFLOW.md`. **Efficiency rule:** `no-agent-watch-loops.mdc`.

## Forbidden

```sh
npm run wait-for-bots -- --watch
npm run pr:gates:check -- --watch
gh pr checks <n> --watch
```

## Every cycle (single shot)

```sh
npm run pr:arm-and-park -- --pr <n>
```

| Exit | Do this |
|------|---------|
| 0 | Report ready; end turn |
| 2 | Report **PARKED**; end turn (auto-merge owns the wait) |
| 3 | Fix actionable items below; push; re-run arm-and-park |
| 1 | Fix tooling; retry |

## When exit 3 (actionable)

1. Conflicts / behind — rebase or `gh pr update-branch`
2. Failed CI — fix and push
3. Unresolved substantive threads — implement/decline, reply in-thread, `resolve-bot-threads.sh <n>`
4. Missing bots at cap — ensure `@codex review` / app install; do not poll for hours

Then: `npm run pr:arm-and-park -- --pr <n>` again.

## When exit 2 (waiting)

Keep ownership via self-wake. Do not busy-poll with `--watch`, and do not hand follow-up to the user. Re-run `pr:arm-and-park` when woken; on exit 3, fix and push.

## Merge

Auto-merge is armed by `pr:arm-and-park`. Do not claim "merged" until the PR is actually merged on GitHub.

## Related

- `workflow-orchestrator` — spawn pr-fix only for **actionable** PRs
- `no-agent-watch-loops.mdc`, `no-early-stop-after-pr.mdc`
