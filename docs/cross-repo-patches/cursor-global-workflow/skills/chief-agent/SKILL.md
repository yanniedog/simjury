---
name: chief-agent
description: >-
  Session coordination: spawn pr-fix only for actionable PRs (arm-and-park exit 3).
  Parked PRs (exit 2) need no babysitter. Never endorse --watch poll loops.
---

# Chief agent (act or park)

Coordinate subagents. Prefer **solution-first** for actionable gaps. Prefer **park** when only bots/CI are pending.

## Open PRs

For each open PR, run (or have orchestrator run):

```sh
npm run pr:arm-and-park -- --pr <n>
```

- Exit **3** → spawn **one** pr-fix worker (actionable).
- Exit **2** → leave parked; **do not** spawn a watcher.
- Exit **0** → merge-pending; no worker.

## Forbidden

- Ending a cycle while exit **3** PRs have no worker.
- Spawning babysitters to `--watch` / sleep-poll bot gates.
- Claiming idle while actionable (exit 3) work is unowned.

Parked (exit 2) PRs are **not** open loops requiring agents — auto-merge + GitHub gates own them.

## Global sync

If this cycle changes ship-bar scripts/rules/skills, mirror to [cursor-global-workflow](https://github.com/yanniedog/cursor-global-workflow) per `global-feature-sync.mdc`.

## Related

- `no-agent-watch-loops.mdc`, `no-early-stop-after-pr.mdc`
- `pr-fix-agent`, `workflow-orchestrator`
