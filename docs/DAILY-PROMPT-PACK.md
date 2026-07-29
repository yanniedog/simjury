# DAILY-PROMPT-PACK.md — drafting prompt for Daily Docket cases

The generation prompt for a weekly batch. Paste the template below (with the
per-case slots filled) into the drafting LLM, one case per run. Design authority:
[`DAILY-CASES.md`](DAILY-CASES.md). Validate every draft with
`cd site/app && npm run validate:cases` before it goes anywhere near a PR.

## Workflow

1. Use one of the seven canonical grave-offence slots in `DAILY-CASES.md`. Never add an
   eighth active case or reuse an old plot.
2. Draft the playable trial, post-verdict analysis, and legal sheet with the
   template below. Set every `gen_meta` reviewer and keep `prompt_version` equal
   to the version line at the bottom of this file.
3. Run the gates. Fix pacing/design/jury/dynamics failures by editing the case.
4. Open one atomic case PR. Every line receives story, language, legal-clarity, and
   sensitivity review before the bot gates.

## Template

> Write one fictional criminal-trial case as a V4 editorial bundle matching
> `site/app/src/lib/v2/caseSchema.ts` and `legalSheetSchema.ts`: a playable trial,
> a separately loaded post-verdict analysis, and a one-page legal sheet. It must be entirely
> invented — no real people, companies, brands, products, courts, or places; invent
> business names and describe platforms by genre ("a rideshare app"). Set
> `label: "fiction"`.
>
> **Audience and specificity:** SimJury is for adults aged 18 and over. Write
> serious-crime facts plainly and specifically. Name the alleged weapon or device
> category, relevant quantities, exact chronology, physical findings, injuries,
> deaths, affected people, and consequences when they help prove or contest an
> element. Do not euphemise a material fact as merely “an incident”, “a device”, or
> “a substance”. Keep descriptions non-graphic and non-operational: never provide a
> reproducible assembly sequence, ratios, wiring or calibration, drug-production
> recipe, trafficking route, real security weakness, or evasion method.
>
> **Slots:** id **{dd-NNNN}** · publish_date **{YYYY-MM-DD}** · offence_code
> **{canonical grave profile}** ·
> reference verdict **{Guilty|Not Guilty}** · tension shape **{feels-guilty-is-innocent |
> feels-innocent-is-guilty | over-trusted-machine | under-trusted-human}** ·
> difficulty_target **{0.3–0.8}** · scenario family **{from DAILY-CASES.md, 2026}**.
>
> **Top-level fields:** `"title"` (invented case title), `"setting"` (contemporary
> 2026 setting sketch), `"charge"` and `"elements"` copied exactly from the selected
> offence profile, `"content_advisories"` containing every profile requirement,
> `"detail_level": "non_graphic"`, and `"gen_meta"` (`{ model: "model-name",
> prompt_version: "dd-2026-v4", reviewer:
> "reviewer-name", batch_pr: "pr-number", language_reviewer: "name",
> sensitivity_reviewer: "name" }`).
>
> **Cast:** 3–4 witnesses, a judge (`side: "court"`), and named prosecuting and
> defence counsel (ids `pc`/`dc`; there is no clerk). The accused is a defence-side
> cast member (`accused.cast_id`); only make them a witness-beat speaker when the
> scenario calls for testimony — many cases leave the accused silent. Exhibits are
> tendered by the counsel they help — a guilt-pointing exhibit by the prosecution, an
> innocence-pointing one by the defence — and exactly the judge speaks `direction`
> beats.
>
> **Engagement layer (all required):** these are what make a juror care about the
> people, not just the puzzle — never skip them. `hook`: a 15–60 word present-tense
> cold open, the first thing read, ending on the case's central tension. `accused`:
> `{ cast_id` (the defence-side accused), `human` (who they are outside this room —
> age, work, relationships, and relevant history without punishment or hardship
> advocacy) `}`. `statements`: `{ opening: { prosecution: { speaker, text },
> defence: { speaker, text } }, closing: { prosecution: { speaker, text }, defence:
> { speaker, text } } }` — each speech 80–120 words, `speaker` = the matching counsel
> id, telling that side's *story* of the case (not a fact list). The epilogue belongs
> only in the analysis file and must be outcome-neutral or contain separate guilty,
> not-guilty, and hung branches.
>
> **Twenty-minute public-juror budget:** write 1,500–1,800 spoken words. Reserve at
> least 180 for the setting, accused, charge, and plain-English elements; 320 across
> the rival openings and closings; and 900 for evidence and directions. These words
> must explain relationships, chronology, unfamiliar legal language, provenance,
> admissibility, and evidentiary limits. They must not repeat the hook or inflate a
> transition. The runtime adds a separate fixed nine-minute interaction allowance.
>
> **Evidence:** 10–14 beats, normally 65–110 spoken words each, set in the
> present day (2026), grouped by speaker with examination/cross `mode` on witness
> beats. Every witness beat, examination and cross, uses explicit structured `turns`.
> Direct examination uses open questions and sensory recollection. Cross uses short
> leading propositions, controlled concessions, occasional resistance, and follow-up.
> Experts qualify methodology and limits; lay witnesses may contract, hesitate,
> correct themselves, or admit incomplete memory. Prefer dialogue-friendly evidence
> (admissions, signed notes, recognition, receipts). Keep any modern record simple;
> do not centre the case on who is visible in unseen camera footage. Each beat carries
> 1–3 `tags` from: identity, alibi, digital_forensics, motive, opportunity, method,
> timeline, credibility, procedure, burden, knowledge, intent, causation, duress,
> command, or coercion. At least one direction beat tagged
> `burden` gives the exact reasonable-doubt direction and explains each unfamiliar
> element in ordinary language. A later direction reminds jurors which facts are
> agreed, which remain disputed, and that punishment is irrelevant.
>
> Do not put `verdict_truth`, `twist`, `epilogue`, `true_weight`, `reveal_stamp`, or
> `reveal_note` in the playable trial. Limit the analysis file to one or two central
> propositions, identify the strongest reasonable opposing interpretation, and mark
> at least one genuinely probative counterweight for the losing side. The legal sheet
> must state the fictional jurisdiction/statute, exact elements, agreed and disputed
> facts, best competent case for each side, foundation and limitations for every
> decisive item, an innocent alternative, required directions, epilogue strategy,
> prejudice checks, named approvals, and a blind-test sign-off.
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
> **Images:** provide a juror-eye court-sketch cover and one neutral, individual,
> text-free courtroom portrait for every cast member and juror. Declare portraits under
> `media.portraits` using `/today/media/<case-id>/characters/<speaker-id>.webp`.
>
> Write with the control and fairness of a skilled crime novelist, but do not disclose
> the completed inference in either opening. The record should be frank enough for an
> adult jury without turning evidential detail into instructions for committing harm.
> Write the whole thing to be *listened to* by someone encountering these people,
> facts, and law for the first time. Output only the three JSON artifacts.

## After drafting — the gates will check (do not fight them)

strict V4 trial/analysis/legal-sheet schemas and computed 19–21 minute budget →
editorial bundle integrity (no pre-verdict spoilers, balanced competent cases,
authenticated decisive material, public-juror context, courtroom structure,
check-ins, jury floors) → **deliberation dynamics** (the simulated room must be able
to reach ≥2 outcomes for a fixed player position, and arguing the decisive evidence
must beat silence toward the reference verdict) → queue rules (uniqueness, verdict variety,
≤3-run) → banned-token scan (extend `BANNED` lists as new content introduces risks).

If dynamics fail (usually "foregone conclusion" for one locked position): every juror
considers an argued beat through their authored reaction rules, while at most four
voice the exchange. No random draw selects a position. Author enough relevant weights
and rules for the strongest three-point synthesis to move the room without coercion.
After three substantive rounds, unanimity is tested first; only then may the neutral
majority direction permit an 11-of-12 verdict. A juror who remains undecided stays
undecided and may cause a hung jury. Fix weak evidence-to-juror connections rather
than converting U votes or lowering the majority threshold.

---
prompt_version: dd-2026-v4
