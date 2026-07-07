## Summary

<!-- One paragraph: what and why -->

## Phase / gate

<!-- e.g. Phase 1 — G-1 partial -->

## Agent role

<!-- Orchestrator / Engineer / Content Curator / etc. -->

## Checklist

- [ ] CI `validate` passes
- [ ] CI `bot-presence-gate` passes (`npm run wait-for-bots -- --pr <n>` exit 0)
- [ ] CI `bot-feedback-gate` passes (all review threads resolved)
- [ ] **All bot review comments fixed in code** (do not wait for user to ask)
- [ ] Reply posted on each bot thread confirming fix or N/A
- [ ] `resolve-bot-threads.sh <pr>` run — zero unresolved threads
- [ ] `npm run pr:gates:check -- --pr <n>` exits 0
- [ ] projectmem decision logged (if scope changed)
- [ ] Case harness checklist (if case content)
- [ ] `assert-pr-mergeable.sh <pr>` passes

## Testing

<!-- Commands run and results -->
