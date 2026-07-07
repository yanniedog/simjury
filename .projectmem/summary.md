# projectmem - workspace

_Last updated: 2026-07-07_

## Project purpose
SimJury is an offline jury simulation game. The repository is in **pilot phase**: a simplified spec, agent harness, and JVM CLI app prove the core loop before the full Android build described in `archive/simjury-build-spec-v3.md`.

## Recent issues
- No issues logged yet.

## Decisions
- Pilot phase: PILOT-SPEC.md supersedes v3 for all work until Phase 4 [PILOT-SPEC.md]
- Single JVM module pilot/ before Android split in Phase 2-3 [ROADMAP.md]
- Case C-000 is synthetic; historical Case 001 deferred to Phase 4 [CASE_HARNESS.md]
- PR gates: CI validate required, squash merge, cursor/*-61f6 branches [.github/BRANCH_PROTECTION.md]
- Phase 1 pilot: Kotlin JVM CLI with kotlinx.serialization JSON cases [pilot/build.gradle.kts]

## Notes
- initialise
- Session start: read CLAUDE.md + pjm brief; never read full v3 spec unless Phase 4+ [AGENTS.md]
- C-000 synthetic case: 2 witnesses, 4 blocks, 2 exhibits, 1 episode [pilot/src/main/resources/cases/c_000/]

## Key files
- `archive/simjury-build-spec-v3.md`
- `PILOT-SPEC.md`
- `CLAUDE.md`
- `kotlinx.serialization`

## Open questions
- None logged yet.
