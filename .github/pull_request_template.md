## Summary

<!-- One paragraph: what and why -->

## Phase / gate

<!-- e.g. Phase 1 — G-1 partial -->

## Agent role

<!-- Orchestrator / Engineer / Content Curator / etc. -->

## Checklist

- [ ] CI `validate` passes
- [ ] `npm run pr:arm-and-park -- --pr <n>` run (exit 0 ready / exit 2 parked OK / exit 3 fix then re-run)
- [ ] CI `bot-feedback-gate` passes (all review threads resolved)
- [ ] **All bot review comments fixed in code** (do not wait for user to ask)
- [ ] Reply posted on each bot thread confirming fix or N/A
- [ ] `resolve-bot-threads.sh <pr>` run — zero unresolved threads
- [ ] Auto-merge armed (squash) — no babysit poll loops
- [ ] projectmem decision logged (if scope changed)
- [ ] Case harness checklist (if case content)

## Testing

<!-- Commands run and results -->
