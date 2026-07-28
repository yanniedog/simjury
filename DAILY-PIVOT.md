# DAILY-PIVOT.md — The Daily Docket (owner decision record, 2026-07-13)

**Status: ACTIVE — this track is now the repo's primary work.** Owner-directed pivot,
decided 2026-07-13. This file is the authority for the daily track; for anything it does
not cover, the standing constraint docs below still bind.

## The decision

simjury.com pivots from a single 25-minute historical case to **The Daily Docket**: one
**synthetic, fictional, 2026-relevant case per day**, playable end-to-end (intro →
evidence → closings → jury room → verdict → judge readout → reveal → share) in
**19–21 minutes under V4**, with a
**dynamic, interactive jury deliberation** whose outcome (unanimous / majority / hung)
genuinely varies with how the player argues.

Owner decisions, recorded verbatim:

1. **simjury is the primary repo.** The separate `simjury-daily` repo (never deployed) is
   **absorbed and retired**: its case pipeline (fiction-pinned zod schema, design-quality
   gate, Wordle-style day selection, trap-analysis scoring, streak/calibration stats,
   spoiler-safe share cards, and its 30-case Victorian docket) moves into `site/app/` here.
   The Victorian 3-minute cases are superseded by the 2026 mandate and are archived for
   provenance (`archive/daily-v1/`), not shipped.
2. **Deliberation is an interactive room** — a deterministic, seeded, client-side engine
   (a deterministic TypeScript engine at daily scale):
   11 fictional jurors with personas, theme weights, and ordered reaction rules; the
    player argues evidence first, then locks their own verdict; seat leanings and
    tallies stay hidden until the judge reads the result. The room's verdict is earned,
    not scripted. Deliberation and narration use no runtime AI. Solo state stays
    on-device; live human rooms may retain short-lived room state.
3. **Case supply is LLM-drafted batches behind hardened CI gates, with human
   spot-checks.** This deliberately relaxes simjury-daily's "a human reads every case"
   rule (owner decision, 2026-07-13). The gates — schema, design-quality, jury floors,
   deliberation-dynamics simulation, banned-token scan, queue rules, ≥14-day runway —
   are the primary defence; `gen_meta` records model, prompt version, and reviewer.
4. **Android/JVM and real historical-case tracks removed (owner, 2026-07-29).**
   Their code, content, sourcing material, build/release automation, and installer
   were deleted and must not be reintroduced. Old `/play` and `/install` URLs
   redirect to the current web product. The Daily Docket remains active.

## What carries over unchanged (binding on the daily track)

- **Static-first hosting (owner-amended 2026-07-29)** — ordinary and solo traffic remains
  static. Only `/api/live/*` and `/discord/interactions` may invoke the Worker and its
  three allowlisted SQLite Durable Objects. Pre-generated narration is served from GitHub Releases and
  falls back to an English voice advertised as local by the browser, keeping adjacent
  speakers distinct when at least two voices exist.
- **No generative runtime AI** — all player-facing text is pre-authored JSON, case
  generation happens in PRs, and Apache-2.0 Kokoro-82M narration is generated in GitHub
  Actions rather than synthesized during play.
- **Fiction, and it says so** — every daily case carries the pinned `label: "fiction"`
  (the simjury-daily safety invariant). Daily cases are built from real trial *patterns*,
  never from real events. The removed real historical-case track must not return.
- **No real names** of people, companies, brands, or specific places in any
  player-visible text — enforced by a banned-token scan.
  2026 relevance is achieved with invented platforms ("a rideshare app"), never brands.
- **Spoiler-safe sharing** — share cards never contain the reference verdict or case content.
- **PR discipline** — one concern per PR, squash merge, bot gates per `WORKFLOW.md`.
  **Exception (owner-approved 2026-07-13):** the D1 import PR below exceeds the
  ≤400-line guideline by nature (it imports an existing, tested codebase verbatim).

## Delivery ladder

| PR | Concern |
|----|---------|
| D0 | This decision record + authority-doc pointers (you are here) |
| D1 | Import simjury-daily pipeline into `site/app/` (vite/TS/vitest scaffold, `src/lib` + tests verbatim, site CI workflow); archive Victorian docket to `archive/daily-v1/` |
| D2 | Case schema v2 (10–14 beats, cast/speakers, theme tags, jury block) + quality gate v2 + hand-authored fixture case `dd-0000` |
| D3 | Deliberation engine (`site/app/src/engine/`) + determinism/variance tests |
| D4 | Player UI: courtroom reader with narration, check-ins, and verdict lock |
| D5 | Player UI: jury room + reveal v2 (trap analysis, twist, streak, share) |
| D6 | Deliberation-dynamics CI gate wired into `validate:cases` |
| D7 | `docs/DAILY-CASES.md` (2026 design system) + prompt pack + launch docket `dd-0001…dd-0014` |
| D8 | Site cutover: homepage → today's case; legacy paths tombstoned; epoch baselined; deploy |
| D9 | (simjury-daily repo) supersession README; operator archives the repo |

The full design (product shape, schema, engine, gates, verification) is captured in the
approved plan of record for this pivot; D2/D3/D7 land the details in-repo as they ship
(`site/app/src/lib/caseSchema.ts`, `site/app/src/engine/`, `docs/DAILY-CASES.md`).

## The 19–21 minute V4 budget (hard design constraint)

V4 targets a 20-minute sitting. Its checked estimate counts the scene-setting,
charge, plain-English elements, accused and character background, counsel
statements, witness evidence, exhibit foundations and limitations, chronology,
and judicial directions at 150 spoken words per minute. It then reserves nine
minutes for courtroom transitions, exhibit inspection, substantive deliberation,
and the result/reveal. That interaction allowance is unchanged: the extra five
minutes must be 750 words of useful explanation, not a larger fictional estimate.

A valid case contains 1,500–1,800 spoken words and separately reserves at least
180 words for the public-juror briefing, 320 for balanced rival openings and
closings, and 900 for evidence and directions. The estimate is computed from
case content; authors cannot override it with a declared duration.

Legacy V3 cases retain their old content floors only while they are awaiting repair.
A content-first repair uses `dd-2026-v3-20min`, which applies the same computed
19–21 minute and section floors while the V4 trial/analysis/legal-sheet consumer is
completed. V3 compatibility is transitional, not the target for new cases.
