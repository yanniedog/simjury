# Project Map - simjury

Status: created

## Project purpose

SimJury is an offline jury simulation game. The repository is in **pilot phase**: a simplified spec, agent harness, and JVM CLI app prove the core loop before the full Android build described in `archive/simjury-build-spec-v3.md`.

## Main folders

- `pilot/` — Kotlin JVM pilot application (Phase 1)
- `archive/` — deferred full specification (v3)
- `.projectmem/` — projectmem event log and derived summary (do not edit summary.md directly)
- `.github/` — CI workflow, branch protection docs, PR template
- `.cursor/` — MCP config for projectmem

## Entry points

- `pilot/src/main/kotlin/simjury/pilot/Main.kt` — CLI game loop
- `PILOT-SPEC.md` — authoritative pilot requirements
- `CASE_HARNESS.md` — case authoring rules for agents

## Important files

| File | Role |
|------|------|
| `README.md` | Quick start and workflow |
| `ROADMAP.md` | Phased rollout gates G-0..G-6 |
| `AGENTS.md` | Agent hierarchy and PR gates |
| `CASE_HARNESS.md` | Inclusion/exclusion + tabulation workflow |
| `CLAUDE.md` | projectmem mandatory bridge for AI sessions |
| `archive/simjury-build-spec-v3.md` | Full future spec (deferred) |

## Relationships

- `pilot/` loads case JSON from `pilot/src/main/resources/cases/c_000/`
- `CASE_HARNESS.md` governs all case JSON authoring
- `ROADMAP.md` defines which features are in scope per phase
- CI (`ci.yml`) runs pilot tests when `pilot/` exists

## Suggested first reads

1. `README.md`
2. `PILOT-SPEC.md`
3. `ROADMAP.md` (current phase only)
4. `.projectmem/summary.md` (via `pjm brief` or MCP `get_summary()`)

## Case assets

- `c_000` — synthetic micro-case "The Pocket Watch" (pilot validation)
