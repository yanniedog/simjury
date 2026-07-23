# projectmem - simjury-repo-hygiene

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
- [DONE] #0003 Legacy /play room outcome requires ten of eleven votes, contradicting its authored 8-3 return, and can describe mixed tallies as one mind [site/public/play/play.js] -> Legacy /play now returns its authored majority verdict and never labels divided or undecided tallies as one mind [site/public/play/play.js] (fixed)
  - Partial attempt: Replaced the 10-vote threshold with a strict majority of all eleven room positions and made verdict copy account for dissent and undecided votes [site/public/play/play.js]
- [DONE] #0002 Android release CI lint model task reads generated case assets without depending on syncCaseAssets [pilot/app/build.gradle.kts] -> All Gradle lint-related tasks now depend on generated case assets, closing the Android release CI ordering failure [pilot/app/build.gradle.kts] (fixed)
  - Failed attempt: Reproduced the exact release lint-model task locally; sandbox blocked Gradle’s fileHashes lock before configuration [pilot/.gradle]
  - Failed attempt: Elevated Gradle retry reached configuration but PowerShell split the -D Java-home argument into a task path [pilot/app/build.gradle.kts]
  - Failed attempt: Correctly quoted Gradle retry reached task dependency resolution; the clean worktree lacked Android SDK configuration [pilot/app/build.gradle.kts]
- [DONE] #0001 Site deployment workflow omits Worker tests, so narration/API regressions can reach deployment after only a Wrangler dry run [.github/workflows/site.yml] -> Deployment workflow now runs the Worker test suite before Wrangler validation and deployment [.github/workflows/site.yml] (fixed)
  - Partial attempt: Added the existing Worker routing and narration suite to the deployment workflow’s required check job [.github/workflows/site.yml]
  - Failed attempt: Ran the Worker suite from the hygiene worktree; manifest generation hit the same sandbox EPERM on its tracked output [site/src/narration-manifest.generated.js]

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
