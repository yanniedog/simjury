# CLAUDE.md

## Start here

The repo's primary work is **The Daily Docket** on **simjury.com** — daily synthetic
2026 cases with an interactive jury room. Before working:

1. Read [`DAILY-PIVOT.md`](DAILY-PIVOT.md) — the owner decision record: what the daily
   track is, its delivery ladder (D0–D9), and the constraints that bind it.
2. **Android / JVM pilot is FROZEN until further notice** (owner, 2026-07-27). Do not
   edit `pilot/` app code, re-enable Android CI/release workflows, ship APKs, or resume
   Phase 4 G-4 device work. [`PHASE4-STATUS.md`](PHASE4-STATUS.md) remains the frozen
   handoff. Lift only on an explicit owner instruction.
3. The historical Case 001 (Beck) web deep-case at `/play` may stay linked from the
   site; do not expand the Android shell around it while frozen.
4. Other authority docs, as needed: [`ROADMAP.md`](ROADMAP.md) (tracks + phase gates),
   [`CASE_HARNESS.md`](CASE_HARNESS.md) (historical case rules — not the daily pipeline),
   [`WORKFLOW.md`](WORKFLOW.md) (PR bot gates), [`site/DECISIONS.md`](site/DECISIONS.md).

## Non-negotiable rules

- **simjury.com only** — agent sessions implement Daily Docket / site work, not Android.
- **Daily cases are fiction, and say so** — the `label: "fiction"` pin is a safety
  invariant. Built from real trial *patterns*, never real events; **no real names** of
  people, companies, brands, or places in player-visible text (banned-token scan).
- **Historical cases: never invent testimony or evidence.** Every block/exhibit must trace
  to a `TABULATION.md` row + a real source (`CASE_HARNESS.md`). Applies to `c_001`, not
  the daily pipeline.
- **No runtime AI; static hosting only** — all player-facing text is pre-authored JSON.
- **One concern per PR, ≤ 400 lines, squash merge.** Agents: `npm run pr:arm-and-park`
  (act or park — never `--watch` babysitting). See `WORKFLOW.md`.

## Build & test

```powershell
# site/app (The Daily Docket — the only active product surface)
cd site/app; npm ci  # once
npm run lint; npm run typecheck; npm test; npm run validate:cases; npm run build
```

Parked (do not run for product work while Android is frozen):

```powershell
# pilot\gradlew.bat -p pilot test   # JVM/Android — frozen
```
