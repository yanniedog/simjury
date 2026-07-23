# DAILY-PIVOT.md — The Daily Docket (owner decision record, 2026-07-13)

**Status: ACTIVE — this track is now the repo's primary work.** Owner-directed pivot,
decided 2026-07-13. This file is the authority for the daily track; for anything it does
not cover, the standing constraint docs below still bind.

## The decision

simjury.com pivots from a single 25-minute historical case to **The Daily Docket**: one
**synthetic, fictional, 2026-relevant case per day**, playable end-to-end (intro →
evidence → verdict → jury room → reveal → share) in **8–10 minutes**, with a
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
   (TypeScript port of `archive/simjury-build-spec-v3.md` §7.7 + §9 at daily scale):
   11 fictional jurors with personas, theme weights, and ordered reaction rules; the
    player argues evidence after locking their own verdict; the room's verdict is earned,
    not scripted. Deliberation and narration use no runtime AI and store no player state
    on a backend.
3. **Case supply is LLM-drafted batches behind hardened CI gates, with human
   spot-checks.** This deliberately relaxes simjury-daily's "a human reads every case"
   rule (owner decision, 2026-07-13). The gates — schema, design-quality, jury floors,
   deliberation-dynamics simulation, banned-token scan, queue rules, ≥14-day runway —
   are the primary defence; `gen_meta` records model, prompt version, and reviewer.
4. **The historical track is parked, not removed.** Case c_001 (Beck) stays live at
   `simjury.com/play` as "the deep case". Phase 4 G-4 work (operator clearance, device
   QA, gate PR) and the Android pilot are **paused indefinitely**; no further effort is
   scheduled on them while the daily track is built.

## What carries over unchanged (binding on the daily track)

- **Static-only hosting** — GitHub-authored assets deploy through Cloudflare Static Assets
  with no Worker script, dynamic route, account, or tracking. Game state and Web Speech
  narration remain entirely on the player's device.
- **No generative runtime AI** — all player-facing text is pre-authored JSON, case
  generation happens in PRs, and narration uses the device's browser voices.
- **Fiction, and it says so** — every daily case carries the pinned `label: "fiction"`
  (the simjury-daily safety invariant). Daily cases are built from real trial *patterns*,
  never from real events. Real historical cases ship only through `CASE_HARNESS.md`.
- **No real names** of people, companies, brands, or specific places in any
  player-visible text — enforced by a banned-token scan (the daily analogue of F-4).
  2026 relevance is achieved with invented platforms ("a rideshare app"), never brands.
- **Spoiler-safe sharing** — share cards never contain the verdict truth or case content.
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
| D4 | Player UI: courtroom reader (narration port from `/play`, check-ins, verdict lock) |
| D5 | Player UI: jury room + reveal v2 (trap analysis, twist, streak, share) |
| D6 | Deliberation-dynamics CI gate wired into `validate:cases` |
| D7 | `docs/DAILY-CASES.md` (2026 design system) + prompt pack + launch docket `dd-0001…dd-0014` |
| D8 | Site cutover: homepage → today's case; `/play` linked as the deep case; epoch baselined; deploy |
| D9 | (simjury-daily repo) supersession README; operator archives the repo |

The full design (product shape, schema, engine, gates, verification) is captured in the
approved plan of record for this pivot; D2/D3/D7 land the details in-repo as they ship
(`site/app/src/lib/caseSchema.ts`, `site/app/src/engine/`, `docs/DAILY-CASES.md`).

## The 8–10 minute budget (hard design constraint)

intro 20–30s · evidence 4.5–5.5 min (10–14 narrated beats, 40–70 words each, 3–4
witnesses, 3–5 conviction check-ins) · verdict lock 30–45s · jury room 2–2.5 min
(2 open rounds → mid-vote → 1 round → final vote; ~3 actions where the player argues;
3–4 jurors speak per round) · reveal + share 1–1.5 min. Pacing is a launch verification step: the
fixture case `dd-0000` must clock 8–10 minutes with narration on before launch content
is drafted.
