# DAILY-CASES.md — the grave-crime design system for Daily Docket cases

How a `dd-*` case is designed. The CI gates (`site/app`: `npm run validate:cases`)
enforce the hard rules; this file holds the taste. Companion: the drafting prompt in
[`DAILY-PROMPT-PACK.md`](DAILY-PROMPT-PACK.md); the decision record in
[`../DAILY-PIVOT.md`](../DAILY-PIVOT.md).

## The rules that override everything

1. **Every case is fiction, and it says so.** `label` is pinned to `"fiction"`. Build
   from *patterns* real trials share — never from a real event, person, company, brand,
   or specific place. Invented names only ("Norwall Haulage", "a rideshare app"). Real
   historical-case track was removed and must not be reintroduced.
2. **Relevant in 2026, always.** Crime, dialogue, and process are contemporary: the
   player should feel they could be summonsed onto this jury this year.
3. **The V4 target is 20 minutes.** Every new V4 case must pass the computed
   19–21 minute window. The commissioned V3 slate retains its existing pacing
   floors only until a content-first `dd-2026-v3-20min` repair or full migration.
4. **Exactly seven active cases.** The guided intro plus six dated sittings form one
   deliberately small, fully authored slate. Old daily, archived, and prototype cases
   are not part of the product.
5. **The charge carries the highest stakes.** Every active case uses one canonical
   grave-offence profile from `offenceProfiles.ts`. Do not combine counts merely to
   make a premise sound larger.
6. **Non-graphic and non-operational.** Everyone is an adult. Do not describe gore,
   attack construction, drug production, trafficking routes, security weaknesses, or
   evasion methods. National-security cases use invented institutions with no real
   geopolitical analogue.

## Shape of the commissioned V3 cases (`site/app/src/lib/v2/caseSchema.ts`)

| Piece | Budget | Why |
|---|---|---|
| Hook | 15–60 words | the cold open — make them care in ten seconds |
| Accused | human + `if_guilty` | a person on trial, not a charge |
| Statements | opening + closing × prosecution/defence, 40–90 words each | the advocates' duel |
| Beats | 10–14, each 40–70 words | ≈25s narration per beat |
| Total evidence | 550–1050 words (all narrated ≤ 1250) | 4.5–5.5 min reading phase |
| Witnesses | 3–4 + judge + prosecution/defence counsel (no clerk) | speaker variety without sprawl |
| Check-ins | optional, in beat order | retained only for compatible authored traces |
| Jury | exactly 11, contested 3–8 G split | the interactive room |
| Twist | 2–4 sentences | the reveal's centrepiece |
| Epilogue | 50–130 words | what the verdict did to these people |

V4 moves editorial analysis and the epilogue out of the playable trial. Its
duration metric counts the scene, charge, accused introduction, four counsel
statements, and spoken evidence at 150 words per minute, then adds a fixed
nine-minute interaction allowance. The schema rejects totals below 19 or above
21 minutes; a hand-entered estimate cannot bypass that gate.

The added time is an explanation budget, not padding. A V4 case needs 1,500–1,800
spoken words, including at least 180 words of scene, charge, elements and accused
background; 320 words across the rival openings and closings; and 900 words of
evidence and directions. Before asking the public to draw an inference, establish:

- where and when the events occurred, who the important people are, and how they
  relate to one another;
- the fictional jurisdiction, the single charge, each element in plain English,
  the prosecution burden, and any unfamiliar legal term;
- what is agreed, what is disputed, and the chronology needed to understand why;
- who created or kept each important record, how it reached court, what it can
  prove, and what it cannot prove; and
- the strongest competent account for each side and the innocent alternative the
  prosecution must exclude.

Do not make the narrator repeat a stock preface. Use the narrator for orientation
and transitions; let counsel explain rival theories, witnesses explain what they
personally perceived or did, experts state qualified limits, and the judge explain
the governing law.

V3's hidden answer-key fields remain only until migration. V4 keeps editorial
assessment in the post-verdict analysis file: one or two central propositions,
at least one genuinely probative counterweight for the other side, the strongest
reasonable opposing interpretation, and no pre-verdict “truth,” “twist,” or
“decisive” label. The trial should make both accounts intelligible before either
closing asks the jury to assemble the inference.

## Make them care (the engagement layer)

A puzzle nobody's invested in is a crossword. The engagement fields exist so the player
meets a **person** before a charge and carries the **stakes** all the way to the reveal:

- **Hook** — a present-tense cold open that states the case's central tension in one
  breath. Not "the defendant is charged with…" but the image the whole trial turns on.
- **Accused** — `human` gives them a life outside the dock (who waits in the gallery),
  `if_guilty` names the concrete cost of a wrong conviction. Shown at the intro and
  again as they stand to face the jury before the lock.
- **Statements** — prosecution and defence each tell their *story* of the case (opening)
  and land their last word (closing), narrated in their own voices. Rival storytellers,
  not fact lists. Exhibits are tendered by the counsel they help.
- **Epilogue** — what the verdict did to these people. Consequence is what makes a
  verdict feel heavy; the guilty-but-sympathetic and the acquitted-but-scarred both get
  their aftermath.

Every witness beat uses explicit structured dialogue. Counsel asks a complete,
specific question; the witness gives a complete answer. Do not use bare yes/no answers,
ambiguous pronouns, unexplained time shifts, or unnamed records. If the speaker,
proposition, or significance is unclear on one listen, rewrite it.

## The seven-case slate

The active corpus contains one case from each profile: murder of an on-duty police
officer; a terrorist assassination attempt against a fictional head of government;
adult hostage-taking; treason in a wholly invented conflict; direction of a fictional
cartel/organised-crime syndicate; large-scale illicit drug manufacturing; and murder.

The setting supplies gravity, not spectacle. The jury still decides one contested
element from admissible evidence. Balance modern records with memory, motive,
credibility, causation, knowledge, intent, command, coercion, duress, and the
burden of proof.
Across seven cases, no two central inferences may depend on the same mechanism.

## Crime-writer standard

- Plant every closing inference in at least two earlier details. Post-verdict analysis
  may connect those details, but must never introduce a stranger, record, or motive.
- Give both sides a psychologically coherent account. Sympathy is never proof, and a
  victim or accused is never reduced to a puzzle prop.
- Each beat makes one principal evidentiary point. State what a record proves and what
  it cannot prove.
- Vary sentence rhythm and voice by speaker. Counsel frame; witnesses remember;
  experts qualify; jurors reason in their own registers.
- Epilogues remain outcome-neutral. They describe consequences without announcing the
  court's verdict, sentence, acquittal, or later confession.

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

## Queue and review rules

- The v3 corpus gate requires exactly seven active cases, including exactly one
  `dd-intro`, and one case from every selected offence profile.
- Verdicts remain mixed; never more than three identical truths in date order.
- Every case receives full line-by-line story, language, legal-clarity, sensitivity,
  portrait, dynamics, and narration review. Sample-only review is not sufficient.
- `gen_meta` records the model, prompt version, PR, content reviewer, language reviewer,
  and sensitivity reviewer.
- Keep the final dated case at least 14 days ahead of the UTC date. Publication dates
  select the featured daily; all seven commissioned cases remain immediately playable
  once bundled through the case library.

## Character art

Every speaking character has an individual contemporary courtroom sketch: judge,
counsel, accused, witnesses, and all eleven jurors. The same portrait appears beside
that character's dialogue. Each case also has a juror-eye cover.

Portraits are neutral, text-free, and non-graphic. They contain no real likeness,
insignia, flag, logo, weapon spectacle, ethnicity-coded villain styling, or visual cue
to guilt. Store them under `public/media/<case-id>/characters/<speaker-id>.webp` and
declare every portrait in the case media block.

## Banned content scan (the daily F-4)

No real person, company, brand, product, court, or place name anywhere player-visible
— including juror lines and reveal notes. When 2026 relevance wants a platform, invent
one and describe its genre ("a rideshare app", "the exchange"). Names from the v1
pattern citations (e.g. historical defendants) stay banned even as allusions.
