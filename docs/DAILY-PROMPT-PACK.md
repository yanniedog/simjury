# DAILY-PROMPT-PACK.md — drafting prompt for Daily Docket cases

The generation prompt for a weekly batch. Paste the template below (with the
per-case slots filled) into the drafting LLM, one case per run. Design authority:
[`DAILY-CASES.md`](DAILY-CASES.md). Validate every draft with
`cd site/app && npm run validate:cases` before it goes anywhere near a PR.

## Workflow

1. Pick the week's slate: 7 scenario/trap-shape/verdict/difficulty slots that satisfy
   the queue rules in `DAILY-CASES.md` (verdict mix, no >3-run, difficulty rhythm,
   scenario variety).
2. Draft each case with the template below. Set `gen_meta.model`, keep
   `prompt_version` = the version line at the bottom of this file.
3. Run the gates. Fix pacing/design/jury/dynamics failures by editing the case.
4. Open one batch PR of ~7 cases. The owner spot-checks (reads 1–2 in full, skims the
   rest for banned content and tone) and merges through the bot gates.

## Template

> Write one fictional criminal-trial case as a single JSON object matching the SimJury
> Daily Docket schema v2 (`site/app/src/lib/v2/caseSchema.ts`). It must be entirely
> invented — no real people, companies, brands, products, courts, or places; invent
> business names and describe platforms by genre ("a rideshare app"). Set
> `label: "fiction"`.
>
> **Slots:** id **{dd-NNNN}** · publish_date **{YYYY-MM-DD}** · charge **{charge}** ·
> true verdict **{Guilty|Not Guilty}** · trap shape **{feels-guilty-is-innocent |
> feels-innocent-is-guilty | over-trusted-machine | under-trusted-human}** ·
> difficulty_target **{0.3–0.8}** · scenario family **{from DAILY-CASES.md, 2026}**.
>
> **Cast:** 3–4 witnesses, a judge (`side: "court"`), and named prosecuting and
> defence counsel (ids `pc`/`dc`; there is no clerk). The accused is one of the
> defence-side witnesses. Exhibits are tendered by the counsel they help — a
> guilt-pointing exhibit by the prosecution, an innocence-pointing one by the defence
> — and exactly the judge speaks `direction` beats.
>
> **Engagement layer (all required):** these are what make a juror care about the
> people, not just the puzzle — never skip them. `hook`: a 15–60 word present-tense
> cold open, the first thing read, ending on the case's central tension. `accused`:
> `{ cast_id` (the defence-side accused), `human` (who they are outside this room —
> age, life, who waits in the gallery), `if_guilty` (the concrete human cost of
> conviction) `}`. `statements`: `opening` and `closing`, each with a `prosecution`
> and a `defence` speech (40–90 words, `speaker` = the matching counsel id) that tells
> that side's *story* of the case, not a fact list. `epilogue`: 50–130 words of what
> happened to these people after the verdict. Hook + all four statements + evidence
> must total ≤ 1250 narrated words.
>
> **Evidence:** 10–14 beats, each 40–70 words, total 550–1050 words, set in the
> present day (2026), grouped by speaker with examination/cross `mode` on witness
> beats. Write the two or three load-bearing cross-examinations as live Q&A dialogue
> (counsel's question, the witness's answer, the pause before a bad one) rather than
> reported summary — it is where the drama lands. Each beat carries
> 1–3 `tags` from: identity, alibi, digital_forensics, motive, opportunity, method,
> timeline, credibility, procedure, burden. At least one direction beat tagged
> `burden` (plain-English burden/standard + "do not research this case online").
> Include ≥1 `misleading` beat (surface_persuasion − true_weight ≥ 0.25) pointing
> away from the true verdict and placed early; ≥1 `decisive` beat (true_weight ≥ 0.6)
> pointing toward it and placed late; beats arguing both directions; `minor` beats
> under 0.6 true_weight. 3–5 `checkins` (beat ids, in order), the last one at or
> after the final misleading beat. Every beat has a `reveal_note` saying what it was
> really worth and why; write the `twist` (2–4 sentences) explaining why the obvious
> read was wrong.
>
> **Jury:** exactly 11 jurors, seats 2–12, ids J-01…J-11. Initial split contested
> (3–8 G, ≥1 NG; a U is welcome). Arcs must include vibes, principled_holdout, and
> mind_changer; give the mind-changer strong weights on the case's decisive theme.
> Per juror: a one-line persona in case-specific terms; `weights` (−2..+2) on themes
> the beats actually carry; ≥6 authored lines across functions including pushback,
> concede, and final (the room overall needs a burden_drift voice and a
> burden_correct voice); 2–4 ordered `reaction_rules` ending in exactly one default
> (`theme:"any", stance:"any"`, no direction). Constrain `when.direction` on any rule
> whose line only reads sensibly agreeing with one side — a juror must never cheer an
> argument their line contradicts. Lines are spoken 2026 English in the juror's
> register, referencing the case's evidence generically (no real names).
>
> Write the whole thing to be *listened to* on a commute: the hook should hook, the
> counsel should sound like rival storytellers, the epilogue should land. Output only
> the JSON.

## After drafting — the gates will check (do not fight them)

schema v2 (incl. the engagement layer, counsel-tendered exhibits, and their word
budgets) → design v2 (trap/signal/both-sides/solvable, pacing, courtroom structure,
check-ins, jury floors) → **deliberation dynamics** (the simulated room must be able
to reach ≥2 outcomes for a fixed player verdict, and arguing the decisive evidence
must beat silence toward the truth) → queue rules (uniqueness, verdict variety,
≤3-run) → banned-token scan (extend `BANNED` lists as new content introduces risks).

If dynamics fail (usually "foregone conclusion" for one locked verdict): only four
jurors respond to each argued beat — the top three by their weight on that beat's
themes, plus one random — so a juror the decisive evidence should move must actually
carry weight on that beat's theme, or it never gets called. The reliable fix is to
give one swing juror (a drifter or the mind-changer) weight 2 on the decisive theme
plus a `proves`-toward-truth rule with delta 2, so skilled play can push the room past
the 10-vote majority even when the player locked the wrong verdict. Then soften a
G-juror's confidence below 70, or add a themed rule with a real delta — before
touching the case text.

---
prompt_version: dd-2026-v2
