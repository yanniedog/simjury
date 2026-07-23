# projectmem - simjury-deps

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
- [DONE] #0002 Worker development audit reports three high libvips CVEs through Wrangler Miniflare’s pinned sharp 0.34.5 [site/package.json] -> Worker development dependency chain is current and clean, with Sharp 0.35.3 overriding Miniflare’s vulnerable pin [site/package.json] (fixed)
  - Partial attempt: Updated Wrangler to 4.113.0 and overrode Miniflare’s vulnerable Sharp pin with patched 0.35.3; lockfile audit is now clean [site/package.json]
- [DONE] #0001 GitHub npm 11.16 rejects the upgraded app lockfile because @emnapi optional native packages are missing [site/app/package-lock.json] -> Toolchain lockfile is synchronized with GitHub’s npm 11.16 and passes the exact clean-install gate [site/app/package-lock.json] (fixed)
  - Partial attempt: Regenerated package-lock.json with GitHub CI’s npm 11.16.0; npm reported zero vulnerabilities [site/app/package-lock.json]

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
- `11.16`
- `package-lock.json`
- `11.16.0`
- `0.34.5`
- `4.113.0`
- `0.35.3`
- `4.113`

## Open questions
- None logged yet.
