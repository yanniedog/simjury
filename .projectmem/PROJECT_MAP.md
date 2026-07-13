# Project Map - simjury

Status: created

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

## Main folders

- `site/app/` — **The Daily Docket** web app (Vite/TS/Vitest): case schema + design-quality
  gate, deliberation engine, player UI. Lands starting PR D1; see `DAILY-PIVOT.md`.
- `site/` — simjury.com marketing/install site (Cloudflare Worker, static assets)
- `pilot/` — Kotlin JVM pilot application + Android shell (**parked** — Phases 1–3, plus the
  Phase 4 historical Case 001 / Beck track)
- `archive/` — deferred full specification (v3) and (post-D1) the retired Victorian daily
  docket, archived for provenance
- `.projectmem/` — projectmem event log and derived summary (do not edit summary.md directly)
- `.github/` — CI workflows (`ci`, `site`, `site-app-ci`, PR bot gates), branch protection docs
- `.cursor/` — MCP config for projectmem

## Entry points

- `DAILY-PIVOT.md` — the daily track's decision record and D0–D9 delivery ladder (read first)
- `CLAUDE.md` — start-here doc for AI sessions, points to the rest
- `site/app/src/lib/caseSchema.ts` / `caseQuality.ts` — daily case schema + design-quality gate
- `pilot/src/main/kotlin/simjury/pilot/Main.kt` — parked JVM pilot CLI game loop
- `PILOT-SPEC.md` — parked pilot track's requirements
- `CASE_HARNESS.md` — case authoring rules for the parked historical track (not the daily pipeline)

## Important files

| File | Role |
|------|------|
| `DAILY-PIVOT.md` | Daily Docket decision record + D0–D9 delivery ladder (primary track) |
| `README.md` | Quick start and workflow |
| `ROADMAP.md` | Track D (daily, current) + Phases G-0..G-6 (parked) |
| `WORKFLOW.md` | PR bot gates (CI + bot-presence + bot-feedback) |
| `AGENTS.md` | Agent hierarchy and PR gates |
| `CASE_HARNESS.md` | Historical-case inclusion/exclusion + tabulation workflow (parked track) |
| `CLAUDE.md` | Start-here doc for AI sessions |
| `archive/simjury-build-spec-v3.md` | Full future spec (deferred) |

## Relationships

- Starting D1 (`DAILY-PIVOT.md`'s ladder): `site/app/` cases (`site/app/cases/*.json`) are
  validated by `site/app/scripts/validate-cases.ts` against `caseSchema.ts` + `caseQuality.ts`;
  CI (`site-app-ci.yml`) runs this on every PR touching `site/app/**`
- `pilot/` loads case JSON from `pilot/src/main/resources/cases/c_000/`, `c_001/` (parked)
- `CASE_HARNESS.md` governs historical case JSON authoring (parked track only)
- `ROADMAP.md` defines which features are in scope per phase/track
- CI (`ci.yml`) runs pilot tests when `pilot/` exists; `site.yml` covers the marketing site;
  `site-app-ci.yml` (from D1 onward) covers the daily app

## Suggested first reads

1. `DAILY-PIVOT.md` — what the daily track is and why
2. `CLAUDE.md` — start-here pointers for the current session
3. `ROADMAP.md` (Track D section — current phase only)
4. `.projectmem/summary.md` (via `pjm show` or MCP `get_summary()`)

## Case assets

- `site/app/cases/*.json` — daily docket cases (fiction-pinned); land starting D1
- `c_000` — synthetic pilot micro-case "The Pocket Watch" (parked track)
- `c_001` — historical Case 001 / Beck, stays live at `/play` (parked track, not resumed)
