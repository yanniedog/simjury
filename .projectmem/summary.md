# projectmem - simjury-runway-a

_Last updated: 2026-07-23_

## Project purpose
SimJury is an offline jury simulation game on simjury.com. **Owner pivot 2026-07-13
(`DAILY-PIVOT.md`): the repo's primary work is now "The Daily Docket"** — one synthetic,
fictional, 2026-relevant case per day, playable end-to-end with a dynamic, interactive
seeded jury deliberation, shipping into `site/app/` (absorbing the separate `simjury-daily`
repo's pipeline). The original JVM/Android pilot (a simplified spec, agent harness, and
Kotlin CLI/Compose app proving the core loop toward the full Android build in
`archive/simjury-build-spec-v3.md`) and the historical-case track (Case 001 / Beck) are
**parked, not removed** — `c_001` stays live at `simjury.com/play` as "the deep case," but
no further pilot/Android effort is scheduled while the daily track is built. See
`DAILY-PIVOT.md` for the decision record and `ROADMAP.md`'s Track D for the delivery ladder.

## Recent issues
- [DONE] #0003 Runway A retains wrong-speaker exhibit phrasing, contradictory decisive innocence notes, and five exculpatory b6 beats marked as guilt [site/app/docket/dd-0015.json] -> PR #102’s wrong-speaker, decisive-reveal, exculpatory-direction, and deliberation-variance defects are corrected [site/app/docket/dd-0015.json] (fixed)
  - Partial attempt: Neutralized eight counsel-as-expert exhibit lines, rewrote five decisive innocence reveal notes, and corrected five exculpatory b6 metadata directions [site/app/docket/dd-0015.json]
  - Partial attempt: Reduced corrected exculpatory b6 weights to the schema’s minor range after the first validator rejected decisive-strength minor beats [site/app/docket/dd-0015.json]
  - Partial attempt: Changed dd-0020’s low-confidence drifter to an initially sceptical position so corrected exculpatory metadata still permits hung and majority outcomes [site/app/docket/dd-0020.json]
- [DONE] #0002 Runway A juror dialogue retains three cloned suffixes, nine verdicts still alternate, and 14 closings start sentences lowercase [site/app/docket/dd-0015.json] -> Runway A juror dialogue, closing sentence case, and publication-order verdict variety are independently release-approved [site/app/docket/dd-0015.json] (fixed)
  - Partial attempt: Replaced three cloned juror suffixes with case-specific evidence reasoning, sentence-cased closings, and reordered two complete cases to break the live verdict pattern [site/app/docket/dd-0015.json]
  - Failed attempt: Ran full web suite after editorial polish; lint and typecheck passed, while Vitest and Vite build were blocked by EPERM creating temporary config bundles [site/app/vite.config.ts]
- [DONE] #0001 Runway cases dd-0015 through dd-0025 contain wrong-speaker testimony, templated closings, repeated filler, and verdict-pattern leakage [site/app/docket/dd-0015.json] -> Confirmed dd-0015 through dd-0025 as a coherent, non-repetitive first runway batch with correct speaker attribution and case-specific reveals [site/app/docket/dd-0015.json] (fixed)
  - Failed attempt: Prepared a bounded deterministic rewrite for dd-0015 through dd-0025; sandbox blocked file writes with EPERM [site/app/docket/dd-0015.json]
  - Partial attempt: First rewrite passed JSON/schema but case gates found 58 issues: short evidence, overlong defence closings, cross-side mismatches, unreachable tag rules, two weight floors, and three dynamics failures [site/app/docket/dd-0015.json]
  - Partial attempt: Second-pass validation reduced 58 findings to three overlong defence closings; all speaker, evidence, rule reachability, weight, and dynamics gates now pass [site/app/docket/dd-0016.json]

## Decisions
- Pilot phase: PILOT-SPEC.md supersedes v3 for all work until Phase 4 [PILOT-SPEC.md]
- Single JVM module pilot/ before Android split in Phase 2-3 [ROADMAP.md]
- Case C-000 is synthetic; historical Case 001 deferred to Phase 4 [CASE_HARNESS.md]
- PR gates: CI validate required, squash merge, cursor/*-61f6 branches [.github/BRANCH_PROTECTION.md]
- Phase 1 pilot: Kotlin JVM CLI with kotlinx.serialization JSON cases [pilot/build.gradle.kts]
- G-0 and G-1 complete — foundation and pilot app on main [ROADMAP.md]
- Phase 2 started: :case-model module extracted with schema and CaseValidator V-rules [pilot/case-model/]
- Mandatory bot-review-window CI job (8 min) blocks premature PR merge; branch protection script added [.github/workflows/ci.yml]
- Phase 2: deliberation-core stub with deterministic PilotDeliberationEngine and phase state machine [pilot/deliberation-core/]
- Owner pivot 2026-07-13: simjury.com pivots to The Daily Docket - one synthetic fictional 2026-relevant case/day with an interactive seeded jury room, absorbing the simjury-daily repo's pipeline into site/app/. The JVM/Android pilot (Phases 1-3) and the historical track (Phases 4-6, Case 001/Beck) are parked, not removed; c_001 stays live at /play. [DAILY-PIVOT.md]
- Case supply for the daily track is LLM-drafted batches behind hardened CI gates (schema, design-quality, jury floors, deliberation-dynamics simulation, banned-token scan, queue rules), with human spot-checks rather than a human reading every case. [DAILY-PIVOT.md]

## Notes
- initialise
- Session start: read CLAUDE.md + pjm brief; never read full v3 spec unless Phase 4+ [AGENTS.md]
- C-000 synthetic case: 2 witnesses, 4 blocks, 2 exhibits, 1 episode [pilot/src/main/resources/cases/c_000/]

## Key files
- `simjury-build-spec-v3.md`
- `PILOT-SPEC.md`
- `CLAUDE.md`
- `kotlinx.serialization`
- `simjury.com`

## Open questions
- None logged yet.
