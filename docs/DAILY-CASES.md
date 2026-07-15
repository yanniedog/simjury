# DAILY-CASES.md — the 2026 design system for Daily Docket cases

How a `dd-*` case is designed. The CI gates (`site/app`: `npm run validate:cases`)
enforce the hard rules; this file holds the taste. Companion: the drafting prompt in
[`DAILY-PROMPT-PACK.md`](DAILY-PROMPT-PACK.md); the decision record in
[`../DAILY-PIVOT.md`](../DAILY-PIVOT.md).

## The rules that override everything

1. **Every case is fiction, and it says so.** `label` is pinned to `"fiction"`. Build
   from *patterns* real trials share — never from a real event, person, company, brand,
   or specific place. Invented names only ("Norwall Haulage", "a rideshare app"). Real
   historical cases ship only through the pilot harness (`CASE_HARNESS.md`).
2. **Relevant in 2026, always.** Crime, dialogue, and process are contemporary: the
   player should feel they could be summonsed onto this jury this year.
3. **The 8–10 minute budget is a design constraint, not a suggestion.** Every floor
   below derives from it.

## Shape of a case (schema v2 — `site/app/src/lib/v2/caseSchema.ts`)

| Piece | Budget | Why |
|---|---|---|
| Beats | 10–14, each 40–70 words | ≈25s narration per beat |
| Total evidence | 550–1050 words | 4.5–5.5 min reading phase |
| Witnesses | 3–4 speaking cast + judge/clerk | speaker variety without sprawl |
| Check-ins | 3–5, in beat order | the conviction trace that powers trap analysis |
| Jury | exactly 11, contested 3–8 G split | the interactive room |
| Twist | 2–4 sentences | the reveal's centrepiece |

The puzzle core is unchanged from v1: **the gap between how a beat feels
(`surface_persuasion`) and what it is worth (`true_weight`)**. Every case needs ≥1
`misleading` trap (gap ≥ 0.25), ≥1 `decisive` signal (worth ≥ 0.6), both sides argued,
and the decisive beats on balance pointing at `verdict_truth`. Put the loud trap early
and the quiet decisive beat late, so the first instinct is the wrong one. Keep every
trap **before the final check-in** — a trap after it can never be scored as bait.

## 2026 scenario space (rotate; never two alike in a week)

- **Synthetic media**: live deepfake calls, cloned voices, "reenacted media" platform
  flags, disputed authenticity of exculpatory video.
- **Money**: romance/investment scams, crypto cash-outs, mule accounts, invoice
  redirection, marketplace fraud, synthetic identities built from breach dumps.
- **Platform work**: rideshare/delivery incidents contested through app telemetry,
  gig-worker accusations, star-rating revenge claims.
- **The instrumented world**: doorbell/dashcam identifications, smart-home logs,
  tracker-tag stalking, phone extraction reports, cell-site cautions.
- **Ordinary crime, modern evidence**: assault outside a venue with three phone videos
  that disagree; burglary hung on a familiar-face ID from a compressed clip.

**Balance the forensics.** Not every case turns on a screen: keep human evidence —
memory, motive, character, procedure — doing real work, and let digital evidence
mislead as often as it saves. The automated-system-is-wrong trap ("the algorithm
flagged it") and the too-clean-trail trap ("the perfect digital fingerprint was
planted") are 2026's versions of the Victorian handwriting expert.

## Trap shapes (alternate; the gate enforces variety of verdicts, you enforce variety of shape)

1. **Feels guilty, is innocent** — loud motive/ID/digital trail, quiet exoneration.
2. **Feels innocent, is guilty** — sympathetic defendant, decisive record convicts.
3. **Over-trusted machine** — the flag/match/log feels decisive, means little.
4. **Under-trusted human** — the shaky-sounding witness is the one telling the truth.

## Voice and process (2026)

- Witnesses speak like real 2026 people under stress: plain, specific, no
  Victorianisms, no lawyer-speak from lay witnesses. Experts are precise and hedged.
- The judge gives modern plain-English directions and at least one beat carries the
  `burden` theme (the gate requires it): burden and standard, plus contemporary
  process realism — "you must not research this case online" earns its place.
- Charges are stated in plain language; elements are 2–4 short sentences.

## The jury block (what makes the room alive)

- Arcs: at least one `vibes`, one `principled_holdout`, one `mind_changer` (gate).
  The mind-changer should be movable by the case's actual decisive theme.
- Weights and rules must reference themes the beats carry (unreachable rules fail).
- Every rule's voiced line must **agree with the argument being made** — constrain
  `when.direction` wherever a line reads sensibly for only one side.
- Each juror: ≥6 authored lines, with `pushback`, `concede`, and `final`; the room as
  a whole needs a `burden_drift` voice and a `burden_correct` voice.
- **The dynamics gate simulates the room** (passive / decisive / trappy / counsel
  strategies × both verdicts) and fails any case whose room is a foregone conclusion
  or does not reward arguing the decisive evidence. If it fails, tune weights,
  initial confidences, and rule deltas — not the gate.

## Queue rules

- Verdict mix roughly balanced; never more than 3 identical verdicts in a row (gate).
- Weekly rhythm: open the week easier (`difficulty_target` ~0.4), peak midweek (~0.7).
- Batch cadence: **one PR of ~7 cases per week**, LLM-drafted from the prompt pack,
  gates green, **owner spot-check** (per `DAILY-PIVOT.md` — the gates are the primary
  defence; a human samples rather than reads every case). `gen_meta` records model,
  `prompt_version`, reviewer, and batch PR — provenance is queryable forever.
- Runway: keep `max(publish_date)` ≥ 14 days ahead of today once the site is live
  (a CI runway gate lands with the D8 cutover, when the epoch is baselined).

## Banned content scan (the daily F-4)

No real person, company, brand, product, court, or place name anywhere player-visible
— including juror lines and reveal notes. When 2026 relevance wants a platform, invent
one and describe its genre ("a rideshare app", "the exchange"). Names from the v1
pattern citations (e.g. historical defendants) stay banned even as allusions.
