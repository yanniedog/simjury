# SIMJURY — COMPLETE BUILD SPECIFICATION AND IMPLEMENTATION PROMPT
## Version 3.0 — Historical-Case Model (Android MVP, Case 001: R v. Adolf Beck, 1896)
## This single document is the entire specification. Part A (Sections 0–18): product, content, engine. Part B (Sections 19–31): application engineering, design, verbatim copy, delivery. Both parts carry equal authority.

---

# SECTION 0 — HOW YOU (THE IMPLEMENTING LLM) MUST USE THIS DOCUMENT

You are implementing SimJury, a single-player Android game. This document is a compliance specification. It is not a suggestion, a starting point, or a source of inspiration. Follow it exactly.

**0.1** Read this entire document before writing any code or content. Then read Section 2 (Invariants) a second time.

**0.2** Your first action in the repository, before any other file, is to create `CONFORMANCE.md` containing a verbatim copy of the Invariant table (Section 2), the Forbidden Actions list (Section 3), and every numbered requirement row from Part B (all IDs of the forms BC-, DS-, SC-, UC-, AR-, EH-, LP-, PB-, DV-, SH-, RP-, EX-), each row extended with two empty columns: `Status` and `Evidence`.

**0.3** At each Stage Gate (Section 16) you must fill in `CONFORMANCE.md`: for every invariant, `Status` = PASS / NOT-YET-APPLICABLE / **BLOCKED**, and `Evidence` = a file path, test name, or content ID that proves compliance. An invariant with no evidence is not PASS.

**0.4 STOP CONDITIONS.** You must halt work and output a report titled `BLOCKED REPORT` instead of proceeding if any of the following occurs:
 (a) You cannot satisfy an invariant.
 (b) Two requirements in this document appear to conflict.
 (c) A required source document (Section 8.2) cannot be verified.
 (d) You are tempted to substitute invented content for sourced content (see F-1).
Never resolve a conflict by silently choosing one side. Never "approximately" satisfy an invariant.

**0.5 TIE-BREAK RULE.** Where this document is genuinely silent (not merely inconvenient), choose the option that (1) violates no invariant, then (2) is simplest, then (3) touches the fewest files. Record every such decision as a numbered entry in `DECISIONS.md` with the format: `D-nnn | date | question | options considered | choice | invariants checked`.

**0.6** You may not remove, weaken, reinterpret, or "modernise" any invariant, schema field, formula, ID, threshold, or word-count in this document, even if you believe you have a better idea. Better ideas go in a file called `SUGGESTIONS.md` and are not implemented.

**0.7** All prose you author (juror lines, UI copy, truth-file text) must be written to the standards in Section 14. All historical content must satisfy Section 8.

---

# SECTION 1 — PRODUCT DEFINITION

SimJury is a single-player, fully offline Android game. The player is Juror 12 in a criminal trial adapted faithfully from a real historical case. During play, all real names, places, and absolute dates are replaced by a fixed pseudonym map and the trial is presented under the rules of the fictional common-law jurisdiction of **Westhaven**. The player reviews the trial in episodes, keeps a notebook, records a private verdict diary, deliberates with eleven deterministic scripted jurors, and delivers a verdict. Only after the verdict is locked does the game reveal, in order: (1) the process score, (2) the player's own diary verbatim, (3) the historical reveal — the real case name, the real names behind every pseudonym, the real verdict, and the documented aftermath — and (4) a spoiler-free shareable verdict card. Case 001 is R v. Adolf Beck, Central Criminal Court, London, 1896.

---

# SECTION 2 — INVARIANTS (THE NON-NEGOTIABLE DESIGN DECISIONS)

Every invariant below must be true of the finished product and must remain true through every stage of development.

| ID | Invariant |
|----|-----------|
| I-1 | The app functions with the `INTERNET` permission absent from the manifest. No network code exists anywhere in the project. |
| I-2 | There are no live LLM calls, no generative-AI runtime components, and no procedurally generated player-facing text. Every player-facing sentence exists verbatim in a resource file or case asset before compile time. |
| I-3 | All case content lives in JSON assets under `assets/cases/case_001/`, validated against the schema in Section 7. No case fact, testimony line, juror line, or truth-file sentence is embedded in Kotlin code. |
| I-4 | Every testimony block, exhibit description, and truth-file claim carries a `source` object (Section 7.6) citing a verifiable public-domain or licensed historical document. Zero exceptions. |
| I-5 | No testimony is invented. Where the historical record is a summary rather than verbatim Q&A, the block is marked `fidelity: "summarised"` and its text asserts only what the source asserts. Where the record is verbatim, `fidelity: "verbatim"`. A third value, `"reconstructed"`, is FORBIDDEN — it must never appear in any asset. |
| I-6 | During play, no real name of any historical person, no real street/venue name, and no absolute year appears anywhere in the UI. Pseudonyms and the year form "18—" are used. The pseudonym map (Section 8.5) is the single source of truth and is applied by lookup, never by hand-retyping. |
| I-7 | The historical reveal (real names, real case, real outcome) is unreachable in code until the player's final verdict is committed to persistent storage. There is no debug flag, deep link, or menu path that bypasses this. |
| I-8 | The deliberation engine is a pure-Kotlin module (`:deliberation-core`) with zero Android imports, driven by `(State, Action, Seed) -> State`, fully serializable, and deterministic: identical action sequences with identical seeds produce byte-identical event logs. |
| I-9 | All randomness flows from one injected 64-bit seed stored with the save. No call to unseeded `Random`, `System.currentTimeMillis()`-as-entropy, or `UUID.randomUUID()` influences game logic. |
| I-10 | The UI never identifies "the clue," never marks a contradiction as correct/incorrect during play, and contains no objection/press mechanic. Player theories are evaluated only in post-verdict scoring. |
| I-11 | The verdict diary (Section 11.4) is mandatory, is stored verbatim, is never editable after submission, and is displayed back verbatim (including typos) on the diary-return screen after the truth reveal. |
| I-12 | Westhaven verdict rules are exactly: unanimity sought; after the deadlock threshold (Section 9.6) the judge permits 10–2; persistent deadlock produces a hung jury, which is a fully supported terminal outcome with its own aftermath text and truth reveal. |
| I-13 | Hung jury, guilty, and not guilty all unlock the truth reveal. No outcome is a fail state; no outcome is replayed-until-correct. Replaying the case is allowed only after the reveal has been seen. |
| I-14 | The share card contains zero truth-file information and zero historical identifiers. Its complete permitted field list is in Section 13 and is exhaustive. |
| I-15 | Juror behaviour is defined entirely in case data (stances, weights, reaction rules, authored lines). The engine interprets; it never authors. |
| I-16 | The burden of proof is prosecution-only throughout: UI copy, judge directions, juror lines, and scoring all treat "the defence didn't prove innocence" as an error pattern (Section 9.5), never as a valid argument the game endorses. |
| I-17 | Process scoring (Section 12) uses only the formulas given. Verdict "correctness" against the historical outcome contributes zero to the score. |
| I-18 | The app carries the disclaimer text of Section 14.4 verbatim on the summons screen and the about screen. |
| I-19 | The Old Bailey Online transcription text is not shipped in the product unless a written commercial licence is obtained and its terms recorded in `LICENSING.md`. Absent that licence, all trial text derives from the public-domain sources in Section 8.2 (b)–(e). |
| I-20 | The clearance checklist (Section 8.3) is embedded in the case JSON as a `clearance` object with every field completed, and the case-integrity test fails if any field is missing or false. |
| I-21 | Content warnings, accessibility requirements (Section 15), and the sources page (Section 8.7) are release blockers, not polish items. |
| I-22 | Module boundaries: `:deliberation-core` and `:case-model` compile with the Kotlin JVM plugin only. `:app` is the only Android module. |
| I-23 | Case 001 supports exactly two verdict options — guilty, not guilty — on a single count (Section 9.6). No third charge is added. |
| I-24 | Minimum content quantities in Section 8.6 and Section 10 are floors. Delivering fewer items than any stated minimum is a BLOCKED condition, not a rounding choice. |
| I-25 | Every ID in every asset matches the ID grammar in Section 7.2, and every cross-reference resolves. The integrity test (Section 16, Gate G-2) enforces this. |
| I-26 | The game never asserts the factual guilt of any historical person beyond what an official record (verdict, confession, pardon, inquiry finding) establishes, and always attributes the finding to that record. |
| I-27 | Saved state survives process death at any screen; the player can quit mid-testimony or mid-deliberation and resume at the same phase with the same engine state and seed. |
| I-28 | All player-facing strings live in Android string resources or case assets; `grep -rn "\"[A-Za-z].* [a-z].*\"" app/src/main/java --include=*.kt` over UI code finds no hardcoded sentences (short technical literals exempt). |

---

# SECTION 3 — FORBIDDEN ACTIONS

You must never do any of the following, at any stage, for any reason:

- **F-1** Invent, embellish, or "reconstruct" historical testimony, dialogue, dates, or facts. If a detail is not in a Section 8.2 source, it does not exist in this game.
- **F-2** Add network, analytics, crash-reporting, advertising, or telemetry dependencies.
- **F-3** Call any generative model at build time to produce case content, or at runtime for any purpose.
- **F-4** Use the real names "Beck," "Smith," "Thomas," "Gurrin," "Spurrell," "Fulton," "Avory," "Gill," or any other real participant name, or the strings "Old Bailey," "1896," "1877," "1904," anywhere reachable before the reveal — including asset filenames, IDs, code identifiers, and logs (I-6). Use pseudonym-map keys (`P-01` etc.) in code.
- **F-5** Weaken a minimum quantity, threshold, formula constant, or schema requirement.
- **F-6** Add gameplay hints that identify decisive evidence (I-10).
- **F-7** Ship placeholder text ("lorem," "TODO," "TBD") in any asset or resource.
- **F-8** Implement microtransactions, accounts, notifications, or any Stage-2+ multiplayer feature.
- **F-9** Store the truth reveal or real-name map in a format the UI can reach before verdict lock (it ships in the same asset pack, but the repository/service layer must gate reads behind the persisted verdict flag — I-7).
- **F-10** Mark any content block `fidelity: "reconstructed"` or introduce any new fidelity value (I-5).
- **F-11** Resolve an ambiguity in this document by guessing instead of applying 0.5, or by asking no one and proceeding on a violated invariant instead of applying 0.4.
- **F-12** Depict or reference sexual violence, violence against children, or graphic injury. Case 001 contains none; do not import any.
- **F-13** Copy Old Bailey Online transcription text into the product without the licence of I-19.

---

# SECTION 4 — TECHNOLOGY STACK (EXACT)

- Language: Kotlin 2.x (latest stable at build time; record exact version in `DECISIONS.md`).
- UI: Jetpack Compose with Material 3. Single activity. Navigation Compose with the route graph of Section 11.1.
- Min SDK 26, target SDK latest stable, compile SDK latest stable.
- Serialization: `kotlinx.serialization` (JSON, `ignoreUnknownKeys = false` — unknown keys are integrity failures).
- Persistence: Jetpack DataStore (Proto or Preferences; if Preferences, state is stored as one serialized JSON blob per slot). No Room, no SQLite.
- DI: manual constructor injection or Hilt — choose once, record in `DECISIONS.md`, apply uniformly.
- Testing: JUnit 5 (JVM modules), kotlinx-serialization round-trip tests, Compose UI tests for the flows in Gate G-4.
- Build: Gradle Kotlin DSL, version catalog (`libs.versions.toml`).
- Fonts: one serif family for testimony/documents, one sans family for UI chrome, bundled, licensed for commercial redistribution (e.g., SIL OFL fonts); record licences in `LICENSING.md`.
- Imagery: no photographs of real people. Exhibits are typeset documents, schematic line-art, and period-style typography rendered from bundled vector/PNG assets you create.

## 4.1 Module and directory structure (exact)

```
simjury/
├── settings.gradle.kts
├── gradle/libs.versions.toml
├── CONFORMANCE.md
├── DECISIONS.md
├── SUGGESTIONS.md
├── LICENSING.md
├── CASE_AUTHORING.md
├── README.md
├── case-model/            (Kotlin JVM)
│   └── src/main/kotlin/simjury/casemodel/   (schema types, validator)
│   └── src/test/kotlin/                     (schema + integrity tests)
├── deliberation-core/     (Kotlin JVM; depends only on :case-model)
│   └── src/main/kotlin/simjury/engine/
│   └── src/test/kotlin/
└── app/                   (Android)
    └── src/main/assets/cases/case_001/
        ├── case.json          (metadata, clearance, jurisdiction ref)
        ├── pseudonyms.json
        ├── trial.json         (episodes, testimony, directions)
        ├── exhibits.json
        ├── jurors.json
        ├── ground_truth.json  (contradiction keys, item valid-use tags)
        ├── truth_file.json    (reveal content — gated per I-7)
        └── sources.json
    └── src/main/assets/jurisdiction/westhaven.json
```

---

# SECTION 5 — THE FICTIONAL JURISDICTION: WESTHAVEN

Encode in `westhaven.json` and surface in plain English on the Summons screen:

- W-1 Trial on indictment before a jury of twelve. The player is Juror 12.
- W-2 The prosecution bears the burden of proof on every element. The standard is proof beyond reasonable doubt ("you must be sure").
- W-3 The accused is not obliged to testify or call evidence; no adverse inference may be drawn (in Case 001 the accused DOES testify — this direction still appears, applied to his election generally).
- W-4 Jurors must decide only on the evidence presented and the judge's directions; outside inquiry is misconduct.
- W-5 Verdict rules exactly as I-12 / Section 9.6.
- W-6 The judge may give: an identification-evidence caution, an expert-evidence direction, a direction on prior allegations/similar-conduct reasoning, and a deadlock direction. All four exist as citable direction objects in Case 001.

---

# SECTION 6 — GAME FLOW (EXACT SEQUENCE)

1. First launch → Content note → Summons (juror oath, Westhaven rules, disclaimer I-18) → Tutorial overlay (≤ 6 tooltips, dismissible, never repeats).
2. Episode 1 → … → Episode 5 (Section 10.3), free navigation backward at all times, forward locked until current episode completed.
3. Verdict Diary (mandatory, Section 11.4).
4. Deliberation (Section 9).
5. Verdict ceremony (Section 11.6).
6. Post-verdict sequence, fixed order, each a distinct screen: Process Score → Deliberation Personality → Doubt Audit → Diary Return → **Historical Reveal** (Section 8.6.8) → Sources Page → Share Card.
7. Case archive state: replay unlocked, reveal re-readable, notebook preserved read-only.

Cold start to first testimony after onboarding: ≤ 4 taps.

---

# SECTION 7 — CASE DATA MODEL (SCHEMA)

## 7.1 General rules
- Every object has a unique `id` (grammar 7.2). Every cross-reference is by `id`. The validator resolves 100% of references or fails.
- All enums are closed. An unexpected enum value is an integrity failure.

## 7.2 ID grammar (regex, anchored)
| Kind | Pattern | Example |
|---|---|---|
| Case | `^C-\d{3}$` | `C-001` |
| Episode | `^E-\d{2}$` | `E-03` |
| Witness | `^W-\d{2}$` | `W-04` |
| Testimony block | `^T-W\d{2}-\d{3}$` | `T-W04-012` |
| Exhibit | `^X-\d{2}$` | `X-07` |
| Direction | `^D-\d{2}$` | `D-03` |
| Juror | `^J-\d{2}$` (J-01..J-11; player is J-12 implicitly) | `J-07` |
| Juror line | `^L-J\d{2}-\d{3}$` | `L-J07-021` |
| Pseudonym entry | `^P-\d{2}$` | `P-01` |
| Contradiction (ground truth) | `^K-\d{2}$` | `K-02` |
| Source | `^S-\d{2}$` | `S-03` |
| Timeline event | `^TL-\d{3}$` | `TL-014` |

## 7.3 `case.json`
Fields: `id`, `title_play` (spoiler-safe play title), `title_reveal` (real case name — read-gated per I-7), `charge` (object: `label`, `elements[]` — each element a plain-English sentence the prosecution must prove), `episode_ids[]`, `content_notes[]`, `clearance` (Section 8.3 object), `estimated_minutes` (int), `schema_version` (`"2.0"`).

## 7.4 `trial.json`
- `episodes[]`: `{ id, title, intro_text, item_order[] }` where `item_order` lists testimony-block, exhibit, and direction IDs in presentation order.
- `witnesses[]`: `{ id, pseudonym_ref (P-xx), role_label, called_by ("prosecution"|"defence"), blocks[] }`.
- Testimony block: `{ id, mode ("examination"|"cross"|"reexamination"), fidelity ("verbatim"|"summarised"), text, source (7.6), timeline_refs[], tags_canonical[] (theme enum 11.3) }`.
- `directions[]`: `{ id, title, text, source (7.6 — the direction is an adaptation; source cites the historical ruling/report it reflects plus `adaptation_note`), citable (bool, all true) }`.

## 7.5 `exhibits.json`
`{ id, title, kind ("document"|"schedule"|"map"|"comparison"|"record"), render_asset, introduced_by, contested (bool), prosecution_claim (1 sentence), defence_claim (1 sentence), source (7.6), timeline_refs[] }`.

## 7.6 `source` object (mandatory on every content-bearing item; I-4)
`{ source_id (S-xx), locator (page/column/paragraph or report section), fidelity_note }`. `sources.json` defines each `S-xx`: `{ id, citation (full bibliographic string), public_domain_basis (one of: "publication pre-1900", "Crown copyright expired", "author died 70+ years ago", "licensed — see LICENSING.md"), url_if_any }`.

## 7.7 `jurors.json`
Per juror: `{ id, pseudonym (fictional persona name — jurors are FICTIONAL, see 8.4), persona (≤ 25 words), register ("plain"|"formal"|"blunt"|"hesitant"), initial: { position ("G"|"NG"|"U"), confidence (0–100), weights: map<theme, -3..+3> }, arc ("mind_changer"|"principled_holdout"|"vibes"|"steady"|"drifter"), reaction_rules[], lines[] }`.
- Reaction rule: `{ when: { theme, stance (11.5 enum), cites_any[] (item IDs, may be empty = any) }, effect: { delta_position (-2..+2 toward G positive), delta_confidence (-20..+20), line_ref (L-xx) } }`. First matching rule wins; rules are ordered; a default rule (`when` all-wildcards) is mandatory per juror.
- Line: `{ id, text (≤ 60 words), function ("agree"|"pushback"|"concede"|"burden_drift"|"burden_correct"|"holdout"|"final_statement"|"small_talk") }`.

## 7.8 `ground_truth.json`
- `contradictions[]`: `{ id (K-xx), item_a, item_b, class ("real_decisive"|"real_immaterial"|"illusory"), resolution_text (shown only in Doubt Audit), source (7.6) }`.
- `valid_uses[]`: for every testimony block and exhibit, the set of (theme, stance) pairs that are fair uses of it. Used by scoring formula 12.2 only.

## 7.9 `truth_file.json` (read-gated; I-7)
Layers in fixed order: `legal_layer`, `factual_layer`, `unknown_layer` ("what the jury did not know"), `aftermath_layer`, each `{ heading, body_blocks[] (each with source per 7.6) }`; plus `pseudonym_reveal[]`: `{ pseudonym_ref, real_name, real_role, fate_note (1–2 sourced sentences) }`; plus `adaptations[]`: every deliberate difference between the game trial and the historical trial, itemised (I-26 honesty requirement).

## 7.10 Validation rules (enforced by `:case-model` tests)
V-1 all IDs match grammar; V-2 all references resolve; V-3 every content item has a resolving `source`; V-4 no `fidelity` value outside the two allowed; V-5 `clearance` complete and all-true where boolean; V-6 quantities meet Section 8.6/10 floors; V-7 every juror has ≥ 40 lines, ≥ 8 reaction rules, exactly one default rule, ≥ 1 `burden_correct` line; V-8 every K-xx class is represented at least once; V-9 no string in play-reachable files matches any F-4 banned token (case-insensitive scan); V-10 every direction of W-6 present.

---

# SECTION 8 — HISTORICAL SOURCING PIPELINE

## 8.1 The rule of the whole game
The trial the player judges is the real trial, faithfully condensed. The reveal is real. Therefore: nothing in the trial record may be invented (F-1), and nothing in the reveal may exceed the official record (I-26).

## 8.2 Approved source classes for Case 001 (and future cases)
(a) Old Bailey Online transcription — ONLY with commercial licence per I-19.
(b) The original printed Sessions Papers / Proceedings pages (pre-1900 publication: public domain) — transcribe independently from page images.
(c) The Report of the Committee of Inquiry into the Case of Mr Adolf Beck (Parliamentary Paper, 1904–05) — Crown copyright expired; the single richest source, containing extensive verbatim extracts of the 1896 evidence and rulings.
(d) Contemporaneous newspaper reports of the 1896 trial and the 1904 events (publication pre-1926: public domain).
(e) Published official records: pardon notice, parliamentary compensation record.
Every source used must appear in `sources.json` with its `public_domain_basis`. If, at content-authoring time, you cannot actually access a needed source document, that is STOP condition 0.4(c): produce a BLOCKED REPORT listing exactly which documents the human operator must supply, structured so the operator can obtain them (e.g., "Committee of Inquiry report, Cd. 2315, pp. n–n covering witness X").

## 8.3 Clearance checklist (embedded as `case.json → clearance`; I-20)
`{ all_participants_deceased: true, youngest_participant_birth_year_bound, matter_finally_closed: true, no_live_review_prospect: true, sources_public_domain_or_licensed: true, no_sexual_offence_content: true, no_child_victim_content: true, no_identification_suppression_orders: true, indigenous_sensitivity_check: "n/a — no Indigenous participants", descendants_risk_note (free text, completed), cleared_by (human name — leave as "PENDING HUMAN SIGN-OFF"), cleared_date }`. The integrity test asserts every boolean true and every text field non-empty. `cleared_by = "PENDING HUMAN SIGN-OFF"` is valid for all gates except G-6 (release), which requires a real name — this forces a human into the loop and is deliberate.

## 8.4 Pseudonym rules (during play)
- PS-1 Every real person, venue, street, and institution in the trial gets an entry in `pseudonyms.json`: `{ id (P-xx), real_name (gated read), play_name, preserved_traits[], rationale }`.
- PS-2 Play names must share no surname, no distinctive forename, and no near-homophone with the real name (anti-search; e.g., the accused Adolf Beck must NOT become "Adam Becker").
- PS-3 Evidentially relevant traits are preserved exactly: the accused's age (mid-50s), silver hair and moustache, Norwegian origin and accent (witnesses described a foreign accent — this is evidence), prior residence in South America; each preserved trait is listed in `preserved_traits`.
- PS-4 Jurors (J-01..J-11) are entirely fictional personas — the historical jurors' identities are not used and not revealed.
- PS-5 Absolute years render as "18—"; month/day and all intervals are preserved exactly (the gap between the 1877 frauds and the charged frauds is evidence — render as "eighteen years earlier"). The reveal restores true dates.
- PS-6 The city is called "the City" or "Westhaven" during play; real London locations map to invented-but-plain equivalents (P-xx entries) with geography preserved only where evidential.

## 8.5 Adaptation rules (what may change, exhaustively)
- AD-1 MAY condense: merge repetitive witnesses per Section 8.6.2's plan; cut counsel speeches to the word floors of 8.6.1; compress procedural matter. Every condensation that removes a prosecution-favourable or defence-favourable point must be balanced (remove proportionally from both sides) and noted in `truth_file.json → adaptations`.
- AD-2 MAY translate procedure to Westhaven form (12 jurors, the W-6 directions, the I-12 verdict rules) — all listed in `adaptations`.
- AD-3 MAY paraphrase `summarised`-fidelity blocks into clean Q&A *form* while asserting only sourced facts; the `fidelity_note` states "form modernised; content per source."
- AD-4 MUST NOT alter: who said what in substance, the sequence of evidence, the existence/direction of the key ruling (8.6.5), physical descriptions, the documents' contents, or the outcome.
- AD-5 MUST NOT import any fact from the 1904 events, the inquiry findings, or later scholarship into the trial phase. The trial phase contains only what the 1896 jury could hear. (This is the entire point of the game.)

## 8.6 CASE 001 CONTENT SPECIFICATION — "THE LIST" (play title)
Charge (single count, I-23): obtaining jewellery by false pretences. Elements in `case.json`: (1) the accused is the man who met the complainant; (2) he made the pretences alleged; (3) they were false; (4) the complainant parted with property because of them.

**8.6.1 Counsel speeches.** Prosecution opening 600–900 words; defence opening 400–700 words; prosecution closing 500–800 words; defence closing 500–800 words. All `summarised` fidelity, sourced to (b)/(c)/(d).

**8.6.2 Witnesses (exactly 9; floors, I-24).** The historical Crown called ~10 complainant women plus police, expert, and identification witnesses. Condense to:
- W-01..W-04: four complainant witnesses (select the four with the richest surviving testimony), each: examination ≥ 8 blocks, cross ≥ 6 blocks. Their accounts establish the fraud method — a well-dressed, foreign-accented "gentleman" of apparent means, an invitation, a written list of clothing to be purchased, a cheque, rings taken "for sizing," disappearance. Cross-examination must preserve the real weaknesses: brief encounters, months-old memories, street identifications, exposure to the accused before formal identification where the record shows it.
- W-05: police officer who conducted the identifications (examination ≥ 6, cross ≥ 6 blocks) — procedure as per the record.
- W-06: the handwriting expert (examination ≥ 6, cross ≥ 5) — testifies the disguised hand of the fraud lists matches the accused's writing. Preserve his actual degree of asserted certainty per the sources; do not soften or sharpen it.
- W-07: the retired constable who identifies the accused as the man convicted of identical frauds "eighteen years earlier" (examination ≥ 3, cross ≥ 3) — INCLUDING the trial's handling of that evidence per the record and ruling 8.6.5.
- W-08: the accused (defence; examination ≥ 8, cross ≥ 8) — denial, account of himself, the South-America residence.
- W-09: one defence witness supporting the accused's account/character as the record allows (≥ 3 + ≥ 2 blocks). If the record does not support a ninth witness, this is a STOP condition, not an invention licence.

**8.6.3 Exhibits (12–16).** Must include: the clothing lists (rendered as period-typeset documents), the handwriting comparison chart (schematic), the cheque(s), a schedule of the complainants' encounters (dates as intervals per PS-5), the identification-parade record, and a chronology exhibit containing one genuine tension present in the real record. Every exhibit sourced.

**8.6.4 Directions (all W-6 four, plus burden/standard).** D-01 burden & standard; D-02 identification caution (Westhaven form; `adaptation_note` records that the historical trial predates modern ID warnings — this adaptation is allowed by AD-2 and must be listed); D-03 expert evidence; D-04 prior-allegation reasoning — reflecting the trial's actual restrictive ruling (8.6.5); D-05 deadlock direction (delivered only if triggered).

**8.6.5 The ruling.** The historical judge confined the defence's ability to litigate the "eighteen years earlier" case — the defence was prevented from proving that the earlier offender was a different man who was in prison/abroad relative to the accused's documented movements. In-game: the defence attempts the line in cross of W-07; the judge intervenes; D-04 records the restriction. The player experiences the door closing without being told what was behind it. Sourced to (c).

**8.6.6 Ground truth.** ≥ 3 contradictions: K-01 `real_decisive` (identification conditions vs. asserted certainty — anchor in specific sourced blocks); K-02 `real_immaterial`; K-03 `illusory`. Populate `valid_uses` for every item.

**8.6.7 Jurors.** Eleven per Section 7.7 with these mandated arcs: J-03 `principled_holdout` (NG lean — "brief glimpses, months ago"); J-07 `mind_changer` (G→NG only if the player cites the identification-conditions material with stance `unreliable_because` — encode via reaction rules); J-01 `vibes` ("ten women can't all be wrong") whose reasoning can be pinned by citation; J-09 burden-drifter ("if he's innocent, why can't he account for every date?") with `burden_drift` lines and correctable via D-01 citation; remaining seven `steady`/`drifter` mix, initial split across all eleven: 7 G / 3 NG / 1 U.

**8.6.8 Truth file (the reveal; every block sourced).**
- Legal layer: the real jury convicted; sentence of penal servitude; no criminal appeal court existed.
- Factual layer: the accused was innocent; in the later year the true offender was arrested mid-fraud and confessed; the Crown pardoned the accused and Parliament compensated him — all attributed to pardon/inquiry records (I-26).
- Unknown layer (minimum 5 entries): the earlier offender's prison medical record proving the two men were physically different; the blocked alibi line; the identification procedures' defects as later found; the expert's error as later found; the systemic absence of any appeal route.
- Aftermath layer: second wrongful conviction on the same method years later; the true offender caught within days; free pardon; inquiry findings criticising the trial; creation of the Court of Criminal Appeal as a direct consequence; the man's death a few years after release. End with the fixed line: "Everything you just read is the documented record. The names you knew were not their names. These are:" followed by `pseudonym_reveal`.

**8.6.9 Balance test (release blocker).** Before Gate G-6, produce `BALANCE.md`: a good-faith 300-word argument for guilt and 300-word argument for acquittal, each citing ≥ 5 in-game item IDs, written only from the trial record. If either cannot be honestly written, the condensation is unbalanced — fix per AD-1 and re-run.

## 8.7 Sources page (in-app, post-reveal)
Lists every `S-xx` citation in full, the `public_domain_basis`, the `adaptations` list verbatim, and a corrections-contact line: "Corrections: simjury-corrections@ [operator to complete]".

---

# SECTION 9 — DELIBERATION ENGINE (`:deliberation-core`)

## 9.1 State machine (closed set of phases, in order)
`INITIAL_POSITIONS → STRONGEST_GUILT → STRONGEST_DOUBT → OPEN_ROUNDS (1..N) → MID_VOTE → OPEN_ROUNDS_2 (1..M) → FINAL_STATEMENTS → FINAL_VOTE → (VERDICT | MAJORITY_PERMITTED → FINAL_VOTE_2 → (VERDICT | HUNG))`
N = 4 rounds, M = 3 rounds, fixed.

## 9.2 Actions (closed set; the only inputs the engine accepts)
`SubmitPosition(position, confidence, top_reason_item, top_doubt_item)` · `NominateStrongest(item, side)` · `Argue(theme, stance, cites[1..2], target_juror?)` · `RequestReview(item)` (budget: 5 per case, enforced) · `CiteDirection(direction_id, target_juror?)` · `Pass` · `FinalStatement(component_ids[], free_text ≤ 200 chars)` · `Vote(position)`.

## 9.3 Turn order
Each open round: player acts first, then J-01..J-11 in ID order. Each AI juror resolves its ordered reaction rules against the most recent player action plus current room tallies; the matched rule's `line_ref` is emitted and deltas applied. Deltas clamp: position moves along U↔lean↔committed track (5-step scale internally: NG-2, NG-1, U, G+1, G+2; votes report the sign, U prompts abstain→judge instructs to lean); confidence clamps 0–100.

## 9.4 Event log
Every action and every juror emission appends `{ tick, actor, action|line_ref, cites[], phase }`. The log is serialized with the save and is the sole input to scoring (I-17). Determinism test: same actions + same seed ⇒ identical log bytes (I-8).

## 9.5 Burden-drift handling
`Argue` with stance `defence_failed_to_prove` is accepted (players may err) but tagged `drift` in the log. When any drift-tagged argument (player's or J-09's line) occurs, `CiteDirection(D-01)` becomes highlighted as available; if the player uses it within the same round, log tag `drift_corrected_by_player`. With probability 0.35 (seeded), a `steady` juror's `burden_correct` line fires the following turn if the player did not correct.

## 9.6 Verdict rules (I-12, exact)
FINAL_VOTE requires 12/12 for verdict. If not unanimous, one more OPEN round is granted, then the judge's D-05 deadlock direction plays and MAJORITY_PERMITTED begins: FINAL_VOTE_2 requires ≥ 10 votes on one side (player's vote counts as 1). 10–2 or 11–1 → verdict (recorded as majority). Otherwise → HUNG (terminal, valid).

## 9.7 Notebook access during deliberation (exact rule)
The player's personal notebook (all six tabs, read-only for flags: no NEW contradiction flags after deliberation begins; notes and bookmarks remain editable) is accessible at all times during deliberation via a persistent bottom-bar button, and consulting it costs nothing. The `RequestReview` budget (5) is different: it is a ROOM action that formally re-presents an item to all jurors, is announced in the room feed, becomes citable in juror reaction rules for the remainder of the session, and is logged. Private reading informs the player; formal review moves the room. Never conflate the two.

---

# SECTION 10 — CONTENT QUANTITY FLOORS (SUMMARY TABLE; I-24)

| Item | Floor |
|---|---|
| Witnesses | 9 (exact roster per 8.6.2) |
| Testimony blocks total | ≥ 110 |
| Exhibits | 12–16 |
| Directions | 5 (D-01..D-05) |
| Contradiction ground truths | ≥ 3 (one of each class) |
| Juror authored lines | ≥ 40 per juror (≥ 440 total) |
| Reaction rules | ≥ 8 per juror + default |
| Truth-file body blocks | ≥ 14 across four layers |
| `unknown_layer` entries | ≥ 5 |
| Sources in `sources.json` | ≥ 4 distinct S-xx |
| Timeline events | ≥ 20 |
| Total trial reading time target | 60–90 minutes across 5 episodes |

---

# SECTION 11 — SCREENS, NAVIGATION, AND PLAYER TOOLS

## 11.1 Navigation routes (exact)
`onboarding/content_note` → `onboarding/summons` → `case/hub` → `case/episode/{E-xx}` → `case/item/{id}` → `case/notebook` (tabs: Bookmarks · Tags · Contradictions · Timeline · Notes · Search) → `case/diary` → `deliberation` → `verdict` → `post/score` → `post/personality` → `post/doubt_audit` → `post/diary_return` → `post/reveal` → `post/sources` → `post/share` → `case/hub` (archive mode).

## 11.2 Notebook tools (all mandatory)
Bookmark any item · tag with themes (11.3) · flag contradiction (pick two items; free-text 140-char rationale; no feedback until Doubt Audit — I-10) · auto timeline from `timeline_refs` with player bookmarks pinned · full-text search across trial text · per-item private notes.

## 11.3 Theme enum (closed)
`identity, opportunity, method, timeline, alibi, expert_reliability, witness_credibility, identification_conditions, documents, burden`.

## 11.4 Verdict diary (I-11)
Fields: leaning (G/NG/U) · confidence slider 0–100 · "top reason" (free text 30–500 chars, required) · "strongest doubt" (free text 30–500 chars, required). One-way commit with confirmation dialog whose text warns it cannot be edited.

## 11.5 Argue stances (closed enum)
`this_proves, this_undermines, unreliable_because, direction_forbids_that_use, defence_failed_to_prove` (the last exists to be an error; 9.5).

## 11.6 Verdict ceremony
Foreperson (J-05) announces; count shown; if majority verdict, the screen states "verdict by majority, 10–2 (or 11–1), as Westhaven law permits"; if hung, the judge discharges the jury with authored text.

---

# SECTION 12 — PROCESS SCORING (EXACT FORMULAS; I-17)

All inputs from the event log and ground truth. Round half-up to integers. Total = sum of five components, max 100.

**12.1 Engagement (max 20).** 10 if the player's `NominateStrongest` in STRONGEST_GUILT cites an item whose `valid_uses` includes (any theme, `this_proves`) for the prosecution; 10 likewise for STRONGEST_DOUBT on the defence side; 0 otherwise per side. (Nominating a genuinely probative item for the side you oppose is the skill.)

**12.2 Citation accuracy (max 25).** Over all player `Argue` actions: `25 × (arguments whose (theme, stance) ∈ valid_uses of every cited item) / (total arguments)`. Zero arguments ⇒ 0.

**12.3 Burden discipline (max 20).** Start 20; −7 per player drift-stance argument (floor 0); +4 (once) if `drift_corrected_by_player` ever fires; +4 (once) if the player cites D-01 or D-04 with a valid target. Cap 20.

**12.4 Doubt audit (max 20).** +10 if any player contradiction flag matches K-01 (`real_decisive`) by item pair; +5 if K-02 matched; +5 if the player did NOT flag K-03 (`illusory`) — or flagged it but later cited its resolving item. Cap 20.

**12.5 Independence (max 15).** 15 if every player vote change is preceded within the same or previous round by a new juror argument or review touching a theme of the player's stated `top_reason`/`top_doubt`; 8 if changes correlate only with vote-tally shifts (majority drift); 15 also if the player never changes and finishes as a coherent holdout (their final statement cites ≥ 1 item); else 8; 0 if the player passed every open round.

**Personality label (display only, non-scoring):** highest of — citations made (`evidence_analyst`), successful direction-citations (`law_focused`), vote-changes-caused-in-others via J-07-class rules (`persuader`), holdout finish (`holdout`), drift arguments ≥ 2 (`intuition_led`), else `steady_hand`. Ties break in the order listed.

---

# SECTION 13 — SHARE CARD (I-14; exhaustive field list)

Rendered to PNG (1080×1350) via Android share sheet. Permitted content, and nothing else: app name and case number/play-title ("SimJury · Case 001 · The List") · player verdict (G/NG/Hung) · jury split (e.g., "10–2") · rounds of deliberation (int) · personality label · three stat lines from: evidence cited (n), reviews requested (n), vote changes (n), directions invoked (n) · the fixed footer "Would you have convicted? simjury" . Forbidden on the card: any truth-file content, any real name, any date, the process score, any text not listed above.

---

# SECTION 14 — WRITING AND CONTENT STANDARDS

- 14.1 Register: sober, plain, period-flavoured but readable. No melodrama, no jokes in trial content. Juror `small_talk` lines may be lightly human, never comic relief about victims.
- 14.2 Reading level: testimony ≤ Grade 10; UI copy ≤ Grade 8.
- 14.3 The game never editorialises about guilt during play. The words "obviously," "clearly," and "of course" are banned from all trial and juror text (lint check in the integrity test).
- 14.4 Disclaimer (verbatim, I-18): "SimJury presents a real historical trial, adapted and condensed from the public record, under the rules of a fictional jurisdiction. Names are changed during play and restored afterwards. Nothing in this game is legal education or legal advice. Where the record is silent, nothing has been invented."
- 14.5 Content note before Case 001: "This case concerns fraud against women in the nineteenth century and a documented miscarriage of justice. It contains no violence."

---

# SECTION 15 — ACCESSIBILITY AND PLATFORM REQUIREMENTS

- 15.1 Full TalkBack support: every interactive element labelled; testimony readable by screen reader in document order.
- 15.2 Dynamic type up to 200% without clipped text or lost functionality.
- 15.3 No information by colour alone; contested exhibits carry a textual badge, not only a tint.
- 15.4 Colour contrast ≥ WCAG AA.
- 15.5 Full function offline and in airplane mode (I-1).
- 15.6 Process-death resilience (I-27): kill the app at any screen in G-4's script; resume must restore phase, notebook, and engine state exactly.

---

# SECTION 16 — STAGE GATES (DO THEM IN ORDER; DO NOT SKIP)

At each gate: update `CONFORMANCE.md` (0.3), run all tests, and print the gate checklist with YES/NO per line. Any NO ⇒ fix before proceeding or issue BLOCKED REPORT.

**G-1 Schema.** `:case-model` types + validator complete; skeleton `case_001` (correct structure, minimal sourced placeholder-free stubs is NOT allowed — instead use a tiny synthetic test fixture case `C-999` living under test resources only) passes V-1..V-10 logic on the fixture. Checklist: fixture validates · every V-rule has a failing-case test · ID regexes tested.

**G-2 Engine.** All 9.1 phases implemented; determinism test (I-8/I-9) green; branch coverage on phase transitions and rule resolution ≥ 90%; every 9.2 action has accept/reject tests per phase.

**G-3 Trial UI.** Episodes, item viewer, all six notebook tabs, diary flow, on device/emulator with fixture case. Cold-start tap count ≤ 4 verified.

**G-4 Full loop.** Deliberation UI + verdict + all post screens with fixture case. Scripted runs (document the action scripts in `test-scripts/`) reaching each terminal outcome: unanimous G, unanimous NG, 10–2, hung. Process-death matrix (15.6) passes. Reveal-gating test: attempt to read `truth_file.json` via the repository before verdict-lock throws.

**G-5 Case 001 authored in full.** All Section 8.6 content complete; V-1..V-10 green on real case; quantity floors table (Section 10) printed with actual counts beside floors; F-4 token scan green; `BALANCE.md` written; source coverage report: every content item's `source_id` and locator listed. If any source document was unavailable, this gate CANNOT pass — BLOCKED REPORT per 8.2.
**Play through the case, in full, on device, once as G-lean and once as NG-lean, and record two findings-and-fixes notes in `DECISIONS.md`.**

**G-6 Release.** All previous gates re-verified on final build; accessibility pass (15.1–15.4); every Part B requirement (Sections 19–30) shows PASS with evidence in `CONFORMANCE.md`; `LICENSING.md` complete (fonts, any licensed text); clearance `cleared_by` bears a human name (8.3) — if it still reads PENDING, stop and hand to the operator; all Section 31 external inputs resolved or formally handed off; signed release artifact built per Section 19; `README.md` documents build, run, and the CASE_AUTHORING.md pipeline for case_002.

---

# SECTION 17 — ORDER OF WORK (STRICT)

1. Repo + `CONFORMANCE.md` (0.2) + Gradle skeleton.
2. `:case-model` + fixture `C-999` + validator → **G-1**.
3. `:deliberation-core` → **G-2**.
4. App shell, trial UI, notebook, diary → **G-3**.
5. Deliberation UI, verdict, post-verdict screens, share card, gating → **G-4**.
6. Author Case 001 (largest single work item; consult sources first, transcribe, then structure) → **G-5**.
7. Polish, accessibility, licensing, release → **G-6**.

Do not begin a later stage before its predecessor's gate passes. Do not author Case 001 content before G-4 proves the pipeline end-to-end on the fixture.

---

# SECTION 18 — GLOSSARY

**Item** — any testimony block, exhibit, or direction. **Drift** — arguing as if the defence bears the burden. **Fidelity** — whether a block is verbatim from source or a summary asserting only sourced facts. **Gated read** — data physically present in assets but unreadable through the repository layer until the persisted verdict flag is set. **Fixture case** — synthetic mini-case `C-999` used only in tests, never shipped in `assets/`.

---
---

# PART B — APPLICATION ENGINEERING, DESIGN, COPY, AND DELIVERY
Part B carries the same authority as Part A. Every numbered requirement below (BC-, DS-, SC-, UC-, AR-, EH-, LP-, PB-, DV-, SH-, RP-, EX-) is a CONFORMANCE.md row per Section 0.2.

---

# SECTION 19 — APPLICATION IDENTITY AND BUILD CONFIGURATION

- **BC-1** `applicationId` = `com.simjury.game`. The operator may override exactly once, before G-1, recorded in `DECISIONS.md`; after G-1 it is frozen.
- **BC-2** `versionName` = `1.0.0` (semver), `versionCode` = 1. Every subsequent build for release increments `versionCode` monotonically; record the mapping in `DECISIONS.md`.
- **BC-3** Build types: `debug` (applicationIdSuffix `.debug`, versionNameSuffix `-debug`, logging enabled) and `release` (R8 minify + resource shrinking ON, logging compiled out per EH-4, debuggable false).
- **BC-4** R8 keep rules: kotlinx.serialization serializers for every `:case-model` type (use `@Serializable`-aware rules), Compose defaults, nothing else broad. A release build must load and validate `case_001` on device as part of G-6.
- **BC-5** Signing: release config reads store file path, store password, key alias, key password from `keystore.properties`, which is listed in `.gitignore` and never committed. If absent, the release build fails with the message "keystore.properties missing — see Section 31 EX-2". Never generate, guess, or hardcode signing secrets (Section 31).
- **BC-6** Outputs: an Android App Bundle (`.aab`) for store submission and a universal signed APK for direct install testing. Both are produced by documented Gradle tasks in `README.md`.
- **BC-7** Dependencies are declared only in `gradle/libs.versions.toml`; adding any dependency not implied by Section 4 requires a `DECISIONS.md` entry and must not violate F-2. No dependency with network transitive behaviour at runtime.
- **BC-8** App icon: adaptive icon, foreground = a schematic balance-scales glyph in `brass500` on transparent, background = solid `ink900`, plus a monochrome layer for themed icons. No text in the icon. No real-case imagery (F-4 applies to the icon).
- **BC-9** Manifest: `android:screenOrientation="portrait"` on the single activity (DV-1), no `INTERNET` permission (I-1), no permissions at all except none — the app requests zero permissions. Sharing uses FileProvider (SH-2), which needs no permission.

---

# SECTION 20 — VISUAL DESIGN SYSTEM (SINGLE DARK THEME)

- **DS-1** The app ships one theme: dark, "lamplit chambers." No light theme, no Material dynamic colour. System font scaling is honoured (15.2).
- **DS-2** Colour tokens (exact, exhaustive; no other colours may appear except in exhibit artwork):

| Token | Hex | Use |
|---|---|---|
| ink900 | #15130E | app background |
| ink700 | #201D15 | surface / cards |
| ink500 | #2A261B | raised surface, dialogs, bottom bar |
| line300 | #3A3426 | dividers, outlines |
| parchment100 | #EFE6D3 | primary text |
| parchment300 | #CFC5AE | secondary text |
| muted400 | #9E9480 | tertiary text, disabled |
| brass500 | #C29B4E | primary actions, active states, links |
| brass700 | #8A6E38 | pressed state of brass500 |
| signalRed | #C4574B | destructive/error text and outlines only |
| signalBlue | #6E8FA6 | informational banners only |

- **DS-3** Contested exhibits, prosecution/defence origin, and drift warnings are indicated by a text badge ("CONTESTED", "CROWN", "DEFENCE", "CHECK THE DIRECTION") plus an outline — never by colour alone (15.3).
- **DS-4** Typography: serif = Source Serif 4 (SIL OFL), sans = Inter (SIL OFL); both bundled, licences recorded in `LICENSING.md` (LP-3). Scale (sp/line-height sp): Display 28/34 serif · Title 22/28 serif · Heading 18/24 sans-semibold · TestimonyBody 17/26 serif · Body 15/22 sans · Caption 13/18 sans · Overline 11/16 sans, +8% letterspacing, uppercase.
- **DS-5** Testimony and document text max line length 34em; all reading surfaces horizontally padded 20dp; 4dp spacing grid throughout; corner radius 12dp (cards) and 8dp (chips/badges); elevation expressed by surface tone (ink700→ink500), not shadows.
- **DS-6** Motion: content transitions ≤ 250 ms, standard easing; no parallax, no springy effects; the verdict ceremony may use a single slow fade (600 ms). Respect the system "remove animations" accessibility setting by disabling all non-essential transitions.
- **DS-7** Icons: Material Symbols outlined set only, tinted parchment300/brass500. No emoji anywhere in the UI.

---

# SECTION 21 — SCREEN-BY-SCREEN SPECIFICATION
Every route from 11.1. Each screen: regions top-to-bottom, its interactions, and its edge states. Copy strings are referenced by UC-ID (Section 22) — no screen may contain copy that is not in Section 22 or in case assets.

- **SC-1 `onboarding/content_note`** — Overline "BEFORE YOU BEGIN"; body = case `content_notes` + UC-1; single button UC-B1. Shown once per install; re-readable from About.
- **SC-2 `onboarding/summons`** — scrollable document styled as a juror summons: Westhaven rules W-1..W-6 in plain English, disclaimer 14.4 verbatim, juror oath text UC-2; button UC-B2 enabled only after scroll reaches end (a "read to the end" affordance, with an accessibility bypass action for screen readers).
- **SC-3 `case/hub`** — case title_play, charge label, elements list, estimated time; vertical episode list E-01..E-05 with state chip each (Locked / In progress / Done); primary button continues at first incomplete item; bottom bar: Notebook · About. After verdict: adds Reveal (re-read) and Share entries; episodes remain browsable read-only.
- **SC-4 `case/episode/{E-xx}`** — episode intro_text, then the `item_order` list; each row shows item type badge, title, read-state dot; tapping opens SC-5. "Complete episode" button appears only when every item is opened at least once; it navigates back to hub with the next episode unlocked.
- **SC-5 `case/item/{id}`** — testimony: witness header (play name, role, called-by badge, mode badge), serif Q&A body with fidelity footnote marker (tapping shows UC-3 fidelity explainer); exhibits: rendered asset full-width, kind badge, contested badge if set, the two one-sentence claims labelled "The Crown says" / "The defence says", source footnote marker (source detail visible only post-reveal — before reveal the marker opens UC-4). Persistent action row: Bookmark · Tag · Flag contradiction · Note. Prev/Next item navigation at bottom.
- **SC-6 `case/notebook`** — six tabs per 11.2. Empty states use UC-5a..UC-5f. Contradiction flow: pick item A (search/bookmark list), pick item B, 140-char rationale, save; flags list shows pairs with rationale, no evaluation shown (I-10). Timeline: vertical, intervals rendered per PS-5, player bookmarks pinned with brass dot. Search: literal substring, case-insensitive, results grouped by witness/exhibit.
- **SC-7 `case/diary`** — UC-6 header explaining permanence; the four fields of 11.4; character counters; Commit button opens confirm dialog UC-D1; on confirm, one-way transition to deliberation lobby.
- **SC-8 `deliberation`** — three regions: (top) phase banner naming the current phase in plain words (UC-7a..UC-7j) + round counter + vote tally chips (G/NG/U counts only — no names attached to tallies until MID_VOTE reveals movement lines); (middle) room feed — juror lines as speech cards with juror play-name and register-consistent avatar initial, player actions echoed; (bottom) action bar exposing exactly the legal 9.2 actions for the current phase, with the Argue composer (theme picker → stance picker → cite picker limited to bookmarked+reviewed items with "all items" expander → optional target juror). Notebook button per 9.7. Review budget shown as "Reviews left: n". Drift highlight per 9.5 renders as a CHECK THE DIRECTION badge on the D-01 chip.
- **SC-9 `verdict`** — foreperson announcement text from case assets; count; majority/hung framing per 11.6; single button UC-B3.
- **SC-10 `post/score`** — total /100 and the five components with one-line formula descriptions UC-8a..UC-8e; no comparison to "correct verdict" anywhere (I-17).
- **SC-11 `post/personality`** — label + its authored one-paragraph explanation template UC-9 filled with the player's own logged actions (counts and item titles only — the template has fixed slots; no free generation, I-2).
- **SC-12 `post/doubt_audit`** — the player's flags vs K-01..K-03 with class labels and `resolution_text`; unflagged ground-truth contradictions listed under UC-10 heading "What you didn't flag".
- **SC-13 `post/diary_return`** — UC-11 header; the diary verbatim (I-11) in a document card; single button UC-B4.
- **SC-14 `post/reveal`** — sequential full-screen document pages in fixed order: legal_layer → factual_layer → unknown_layer → aftermath_layer → pseudonym_reveal table (play name → real name → fate_note) → adaptations list. Progress dots; no skipping forward past an unread page; back always allowed.
- **SC-15 `post/sources`** — Section 8.7 content.
- **SC-16 `post/share`** — card preview exactly as it will render, Share button (SH-1..SH-4), Done → hub (archive mode).
- **SC-17 `about`** (from hub bottom bar) — app version, disclaimer 14.4, content note re-read link, licences (LP-3), corrections contact.
- **SC-18 System screens** — save-recovery dialog UC-D2 (AR-6), fatal integrity screen UC-E1 (EH-2).

---

# SECTION 22 — VERBATIM UI COPY
All strings below ship exactly as written (en-AU spelling). Anything not specified here or in case assets must be composed under 14.1–14.3 and logged in `DECISIONS.md` with its final text — but first check: Part B was written so that list should be near-empty.

**Buttons:** UC-B1 "I understand" · UC-B2 "Take the oath and enter" · UC-B3 "Continue" · UC-B4 "See what really happened" · UC-B5 "Share card" · UC-B6 "Done".

**Core copy:**
- UC-1 "What follows is a real trial from the historical record, with names changed. You will judge it on the evidence alone. Afterwards, you will learn what the record shows."
- UC-2 (oath) "I will faithfully try the case before me and give a true verdict according to the evidence."
- UC-3 (fidelity explainer) "Marked passages are condensed from the historical record. Nothing has been added to them."
- UC-4 (pre-reveal source marker) "This item is drawn from the historical record. Full sources are shown after your verdict."
- UC-5a..f (notebook empty states) a: "Nothing bookmarked yet." b: "No tags yet." c: "No contradictions flagged. If two pieces of evidence can't both be true, flag them here." d: "The timeline builds as you read." e: "No notes yet." f: "Search the whole trial record."
- UC-6 "Before you deliberate, record where you stand. This entry cannot be changed, and you will see it again — after everything."
- UC-7a..j (phase banners) a INITIAL_POSITIONS: "Where does the room stand?" b STRONGEST_GUILT: "Name the strongest point for the Crown — whatever you believe." c STRONGEST_DOUBT: "Name the strongest doubt — whatever you believe." d OPEN_ROUNDS: "Deliberation — round {n} of {N}." e MID_VOTE: "A show of hands." f OPEN_ROUNDS_2: "Deliberation continues — round {n} of {M}." g FINAL_STATEMENTS: "Last words. Everyone speaks once." h FINAL_VOTE: "The verdict must be unanimous." i MAJORITY_PERMITTED: "The judge will now accept a verdict of at least ten." j FINAL_VOTE_2: "Final vote."
- UC-8a..e (score lines) a "Engagement — did you name the best point for each side?" b "Citation accuracy — did the evidence say what you claimed?" c "Burden discipline — the Crown must prove; the accused need prove nothing." d "Doubt audit — did you find the tensions that mattered?" e "Independence — did evidence move you, or did the room?"
- UC-9 (personality template) "You deliberated as {label}. You cited {n_citations} pieces of evidence, invoked the judge's directions {n_directions} time(s), changed your vote {n_changes} time(s), and requested {n_reviews} formal review(s). Your final position: {position}."
- UC-10 "What you didn't flag"
- UC-11 "Before deliberation, you wrote this."
- UC-D1 (diary confirm) title "Commit your entry?" body "This cannot be edited or rewritten. You will see it again after the verdict and the reveal." actions "Commit" / "Keep writing".
- UC-D2 (save recovery) title "Saved game can't be read" body "Your save was made by an incompatible version. You can start the case again; the app will keep a copy of the unreadable save." actions "Start again" / "Close app".
- UC-E1 (fatal integrity) "SimJury's case files failed verification (code {code}). Reinstall the app. No progress can be made with damaged case files."
- UC-T1..T6 (the tutorial's six tooltips, in order, each ≤ 20 words) T1 (hub) "Read the trial in order. You can always go back." T2 (item) "Bookmark, tag, or flag anything. Your notebook is yours alone." T3 (contradiction) "If two things can't both be true, flag the pair." T4 (timeline) "The timeline grows as you read." T5 (diary) "One entry. No edits. You'll meet it again." T6 (deliberation) "Cite evidence, not feelings. The room responds to what you point at."

---

# SECTION 23 — ARCHITECTURE AND SAVE MODEL

- **AR-1** Pattern: MVVM with unidirectional data flow. Compose screens observe `StateFlow<UiState>` from one ViewModel per route group; ViewModels call repositories; repositories are the only classes touching DataStore, assets, or `:deliberation-core`.
- **AR-2** Repositories (exact set): `CaseRepository` (loads and validates case assets; exposes trial content; refuses `truth_file`/`title_reveal`/`pseudonyms.real_name`/`source detail` reads unless `SaveRepository.verdictLocked == true` — this is the single enforcement point for I-7/F-9), `SaveRepository` (the save model below), `EngineController` (owns engine state, applies actions on `Dispatchers.Default`, persists after every action).
- **AR-3** Threading: engine and validation on `Dispatchers.Default`; DataStore on `Dispatchers.IO`; no `GlobalScope`; no `runBlocking` outside tests.
- **AR-4** Save model, one slot, serialized JSON in DataStore under key `save_v1`:
`{ schema_version: 1, case_id, seed: Long, created_at, updated_at, episode_opened: map<item_id, bool>, episodes_complete: [E-xx], notebook: { bookmarks: [id], tags: [{item_id, theme}], flags: [{item_a, item_b, rationale}], notes: [{item_id, text}] }, diary: null | { leaning, confidence, top_reason, strongest_doubt, committed_at }, engine: null | <serialized engine state incl. event log>, review_budget_used: Int, verdict: null | { outcome, split, majority: bool, at }, reveal_pages_read: Int, reveal_complete: bool, tutorial_done: bool, content_note_seen: bool }`
- **AR-5** Every mutation persists before the UI reflects it (write-through), satisfying I-27 by construction.
- **AR-6** Migration policy: on `schema_version` mismatch or parse failure, copy the raw blob to key `save_quarantine`, show UC-D2, and only reset on explicit user choice. Never silently wipe.
- **AR-7** The engine seed is generated once per case start from `SecureRandom`, immediately persisted, and thereafter only ever read (I-9 allows entropy only at this single, stored point).

---

# SECTION 24 — ERROR HANDLING AND LOGGING

- **EH-1** All asset reads and JSON decoding are wrapped at the repository boundary; no raw exceptions reach ViewModels.
- **EH-2** Case validation failure at runtime (should be impossible after G-5, but defend anyway) shows UC-E1 with a short stable code per validation rule (e.g., `V-3/T-W04-012`). The app does not attempt partial play with a damaged case.
- **EH-3** There is no crash-reporting SDK (F-2). Uncaught exceptions crash normally; QA relies on local logcat.
- **EH-4** Logging: `Log.*` calls are gated behind `BuildConfig.DEBUG`; release builds emit nothing. Logs never contain case text, diary text, or real-name-map contents even in debug (F-4 discipline applies to logs).

---

# SECTION 25 — AUDIO, HAPTICS, AND LANGUAGE

- **LP-1** Audio: none. The app ships zero sound assets and never plays sound. (Deliberate: reading game, and silence is cheaper than good audio.)
- **LP-2** Haptics: a single light tick (`CONFIRM` haptic constant) on exactly two events — diary commit and final verdict commit. Nowhere else.
- **LP-3** Language: English (en-AU values as default resources). Every string in resources per I-28. `LICENSING.md` records both font licences. No other locales in MVP; the resource structure must not block adding them later (no concatenation-built sentences; use placeholders).

---

# SECTION 26 — PERFORMANCE BUDGETS

- **PB-1** Release download size ≤ 30 MB (the content is text and vector; if exceeded, audit assets, do not cut content).
- **PB-2** Cold start (launcher tap → hub interactive) ≤ 2.0 s on a Pixel 6a-class device; case validation runs once per process start, off the main thread, behind a branded load state.
- **PB-3** Scrolling the longest episode and the deliberation feed shows no visible stutter at default animation scale (baseline profile generated at G-6 if needed).
- **PB-4** Steady-state memory ≤ 250 MB. The full case stays resident once loaded (it is small); do not stream.

---

# SECTION 27 — DEVICE AND OS BEHAVIOUR

- **DV-1** Portrait-locked on all devices. On tablets/foldables, content is centred at max width 640dp on ink900; no two-pane layouts in MVP.
- **DV-2** Predictive back gesture enabled; back navigation never loses typed text without the relevant confirm dialog (diary uses UC-D1's "Keep writing" path; note fields autosave on every keystroke via AR-5).
- **DV-3** Process death at any screen restores exactly per 15.6 / AR-5.
- **DV-4** Screenshots are permitted (no `FLAG_SECURE`) — sharing is a feature, and spoiler protection is the player's own concern after their verdict.
- **DV-5** The app declares no deep links and exports nothing except the launcher activity and the FileProvider.

---

# SECTION 28 — SHARE CARD IMPLEMENTATION

- **SH-1** The card (Section 13) is rendered off-screen by Compose at exactly 1080×1350 px using DS tokens, then encoded to PNG.
- **SH-2** The PNG is written to `cacheDir/share/` and exposed via `FileProvider` with authority `${applicationId}.fileprovider`; share uses `ACTION_SEND`, MIME `image/png`, `FLAG_GRANT_READ_URI_PERMISSION`, and ClipData set.
- **SH-3** A unit-testable `ShareCardModel` builds the card's field values from the event log and verdict; a test asserts the model can never contain any string from `truth_file.json`, `pseudonyms.real_name`, or the F-4 token list (I-14 enforced by test, not by care).
- **SH-4** Cache files older than the current case verdict are deleted on each share (no unbounded cache growth).

---

# SECTION 29 — RELEASE PACKAGING AND STORE SUBMISSION

- **RP-1** `README.md` documents: clean-machine build steps, the two artifact tasks (BC-6), how to install the universal APK, and how to run every test suite.
- **RP-2** Google Play data safety declaration (documented in `RELEASE_NOTES.md` for the operator): no data collected, no data shared, no encryption claims needed, no account required — all truthful because of I-1/F-2.
- **RP-3** Privacy policy: Play requires a URL even for offline apps. Ship `PRIVACY_POLICY.md` in the repo with this exact text for the operator to host: "SimJury collects no data. The app has no internet access, no accounts, no analytics, and no advertising. All progress is stored only on your device and is deleted when you uninstall the app. Contact: [operator email]." The URL itself is EX-4.
- **RP-4** Content rating (IARC questionnaire guidance for the operator): references to criminal proceedings and fraud; no violence, no sexual content, no profanity, no controlled substances, no gambling, no user interaction, no data collection.
- **RP-5** Store listing assets: 512×512 icon export of BC-8; feature graphic 1024×500 using DS tokens and the tagline "Twelve jurors. One verdict. Then the truth."; 4–8 phone screenshots taken from the fixture-free final build. F-4 applies to every store asset and every line of store copy: no real names, no real dates, no outcome spoilers. Store description must include the sentence "Based on a real historical trial — revealed only after your verdict."
- **RP-6** The release tag in version control is created only after G-6 passes; the tag message lists the `CONFORMANCE.md` commit hash.

---

# SECTION 30 — CONSOLIDATED DEFINITION OF DONE
The project is complete when, and only when, all of the following are simultaneously true: all Section 16 gates G-1..G-6 passed in order with printed checklists · `CONFORMANCE.md` shows PASS with evidence for every I-, F- (as "never violated" attestations with the scan/test that proves it), BC-, DS-, SC-, UC-, AR-, EH-, LP-, PB-, DV-, SH-, RP- row · every Section 31 EX row shows RESOLVED or HANDED-OFF · the signed `.aab` and universal APK exist and install · a complete on-device playthrough of Case 001 to each of the four terminal outcomes has been performed on the release build · `BALANCE.md`, `LICENSING.md`, `PRIVACY_POLICY.md`, `RELEASE_NOTES.md`, `CASE_AUTHORING.md`, `DECISIONS.md`, and `SUGGESTIONS.md` all exist and are current.

---

# SECTION 31 — IRREDUCIBLE EXTERNAL INPUTS (EX)
These are the only things this specification cannot contain, by nature. Each has a protocol; none may be improvised around. EX rows in `CONFORMANCE.md` may carry status `HANDED-OFF` with evidence = the dated handoff note in `DECISIONS.md`.

- **EX-1 Historical source documents.** The actual text of the Section 8.2 sources must be supplied by, or its access confirmed with, the human operator before G-5 content authoring begins. If unavailable: BLOCKED REPORT listing each needed document, the witnesses/exhibits it covers, and acceptable substitutes within 8.2's classes. Under no circumstances proceed by memory or invention (F-1).
- **EX-2 Signing keystore.** Created and held by the operator. The build reads it per BC-5. Never generate a keystore silently and never commit one.
- **EX-3 Clearance sign-off.** A human name in `clearance.cleared_by` (8.3), supplied by the operator after their own review, gates G-6.
- **EX-4 Operator strings.** Privacy-policy hosting URL (RP-3), corrections email (8.7), Play developer account. Ship with visible `[OPERATOR: …]` placeholders ONLY in `RELEASE_NOTES.md` — never in app resources (F-7); the app's About screen reads these from a single `operator.json` asset the operator completes, and G-6 verifies no placeholder tokens remain in it.
- **EX-5 Old Bailey Online licence decision.** Default assumption: no commercial licence obtained; therefore I-19's fallback path is mandatory and `sources.json` must contain no OBO-derived text. If the operator obtains a licence, its terms go in `LICENSING.md` before any OBO text enters assets.

*End of specification. It is intended to be complete. If you find it is not — that is STOP condition 0.4(b), not an invitation to improvise. Begin with Section 0.2.*
