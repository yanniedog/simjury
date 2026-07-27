---
name: workflow-orchestrator
description: >-
  Queue coordinator: route work, spawn pr-fix only for actionable PRs.
  Never instruct agents to --watch bot gates; use pr:arm-and-park.
---

# Workflow orchestrator (act or park)

Coordinate the PR queue. **Do not** run multi-PR babysit loops yourself. **Do not** tell workers to `--watch`.

## Per open PR

```sh
npm run pr:arm-and-park -- --pr <n>
```

| Exit | Orchestrator action |
|------|---------------------|
| 0 | Track as merge-pending; no worker needed |
| 2 | **Parked** — no worker; GitHub owns wait |
| 3 | Spawn/resume **one** pr-fix worker for that PR |
| 1 | Escalate tooling |

**Never** spawn a pr-fix/babysit worker whose only job is to poll until bots post.

## Forbidden closeout

```sh
# DO NOT
npm run wait-for-bots -- --watch
while true; do npm run wait-for-bots; sleep 45; done
```

## Idle claim

Queue is idle for agent work when every open PR is exit 0 or exit 2 from `pr:arm-and-park` (or merged). Exit 3 PRs must have an active pr-fix worker.

## Related

- `pr-fix-agent` skill
- `no-agent-watch-loops.mdc`
- Repo `WORKFLOW.md`
