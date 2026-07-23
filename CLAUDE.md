# CLAUDE.md

## Start here

The repo's primary work is **The Daily Docket** — daily synthetic 2026 cases with an
interactive jury room on simjury.com. Before working:

1. Read [`DAILY-PIVOT.md`](DAILY-PIVOT.md) — the owner decision record: what the daily
   track is, its delivery ladder (D0–D9), and the constraints that bind it.
2. The historical track (Phase 4 / Case 001 / Beck, Android pilot) is **parked** —
   [`PHASE4-STATUS.md`](PHASE4-STATUS.md) is its frozen handoff. Do not resume it without
   an owner instruction.
3. Other authority docs, as needed: [`ROADMAP.md`](ROADMAP.md) (tracks + phase gates),
   [`CASE_HARNESS.md`](CASE_HARNESS.md) (historical case rules — not the daily pipeline),
   [`PILOT-SPEC.md`](PILOT-SPEC.md), [`WORKFLOW.md`](WORKFLOW.md) (PR bot gates),
   [`site/DECISIONS.md`](site/DECISIONS.md) (web-surface decisions).

## Non-negotiable rules

- **Daily cases are fiction, and say so** — the `label: "fiction"` pin is a safety
  invariant. Built from real trial *patterns*, never real events; **no real names** of
  people, companies, brands, or places in player-visible text (banned-token scan).
- **Historical cases: never invent testimony or evidence.** Every block/exhibit must trace
  to a `TABULATION.md` row + a real source (`CASE_HARNESS.md`). Applies to `c_001`, not
  the daily pipeline.
- **No runtime AI; static hosting only** — all player-facing text is pre-authored JSON.
- **One concern per PR, ≤ 400 lines, squash merge.** Wait for the bot gates
  (`WORKFLOW.md`). (Documented exception: the D1 import PR — see `DAILY-PIVOT.md`.)

## Build & test

```powershell
# site/app (the Daily Docket — where D1+ work happens)
cd site/app; npm ci  # once
npm run lint; npm run typecheck; npm test; npm run validate:cases; npm run build

# pilot (parked JVM/Android track — see "Start here" above)
pilot\gradlew.bat -p pilot test        # build + all JVM tests (case-model + pilot)
```

