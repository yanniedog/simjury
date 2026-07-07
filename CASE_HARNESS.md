# Case Authoring Harness

Instructions for AI agents and human authors selecting, adapting, moulding, and tabulating case material for SimJury.

**Read this before authoring or importing any case content.**

---

## 1. Purpose

The harness ensures every case is:

- Historically honest (or explicitly synthetic)
- Play-safe (pseudonyms, content warnings, clearance)
- Schema-valid
- Sized appropriately for the current rollout phase

Agents **must not** invent testimony. Agents **must** tabulate source coverage before writing JSON.

---

## 2. Inclusion criteria (all required)

A case is **eligible** only when every row passes:

| # | Criterion | Evidence |
|---|-----------|----------|
| I-1 | Matter is finally closed; no live parties at risk | `clearance.matter_finally_closed` |
| I-2 | All participants deceased OR synthetic case | `clearance.all_participants_deceased` or `synthetic: true` in case.json |
| I-3 | Sources are public domain, licensed, or synthetic | `sources.json` + `LICENSING.md` if needed |
| I-4 | No sexual violence, child victims, or graphic injury | `clearance` booleans |
| I-5 | Trial record sufficient for charge elements | Tabulation (Section 5) shows no gaps |
| I-6 | Pseudonym map covers every real person/place in play | `pseudonyms.json` complete |
| I-7 | Phase-appropriate size (see Section 4) | Count table meets floor |
| I-8 | Balance: honest prosecution and defence arguments possible | `BALANCE.md` (Phase 4+) |

---

## 3. Exclusion criteria (any one blocks)

| # | Exclusion | Action |
|---|-----------|--------|
| E-1 | Record requires invention to fill gaps | **STOP** — BLOCKED REPORT listing missing documents |
| E-2 | Identification suppression orders active | Exclude case |
| E-3 | Indigenous sensitivity unresolved | Human review required |
| E-4 | Old Bailey Online text without licence | Use `archive/simjury-build-spec-v3.md` Section 8.2 classes (b)–(e) only |
| E-5 | Case exceeds current phase floors | Defer or condense per adaptation rules |
| E-6 | `fidelity: "reconstructed"` needed | Forbidden — summarise or omit |
| E-7 | Real names would leak pre-reveal | Fix pseudonym pipeline |

---

## 4. Phase floors (quantity)

| Item | Pilot C-000 | Phase 4 historical |
|------|-------------|-------------------|
| Witnesses | 2 | 6–9 |
| Testimony blocks | ≥ 8 | ≥ 60 |
| Exhibits | 2 | 8–12 |
| Episodes | 1 | 3–5 |
| Contradictions (ground truth) | 1 | ≥ 3 |
| Sources (distinct) | ≥ 2 | ≥ 4 |
| Juror lines | 0 (pilot) | ≥ 20 per juror |

**Rule:** Never import v3 Section 10 floors until Phase 5 deliberation is in scope.

---

## 5. Agent workflow: select → adapt → mould → tabulate

### Step A — Select

1. Propose case with one-paragraph rationale (why this case teaches jury reasoning).
2. Run inclusion checklist (Section 2).
3. Run exclusion scan (Section 3).
4. Log decision: `pjm decision "Case candidate: <name> — included/excluded because …"`

### Step B — Source acquisition

1. List every required document (bibliographic, not from memory).
2. If any document is unavailable → **BLOCKED REPORT** (do not author JSON).
3. Create `sources.json` entries first (`S-01`, `S-02`, …).

### Step C — Tabulate (before writing testimony)

Create `cases/<id>/TABULATION.md`:

```markdown
# Tabulation — C-xxx

| Element / theme | Source ID | Locator | Verbatim? | Notes |
|-----------------|-----------|---------|-----------|-------|
| Accused identity | S-01 | p.12 | summarised | … |
```

Every row in the eventual trial must trace to a tabulation row. Empty cells = gap = blocked.

### Step D — Adapt

Allowed:

- Condense repetitive witnesses (note in `truth_file.json` → `adaptations[]`)
- Modernise Q&A form with `fidelity: "summarised"`
- Translate procedure to Westhaven jurisdiction

Forbidden:

- Change who said what in substance
- Import post-trial facts into trial phase
- Soften/sharpen expert certainty beyond the record

### Step E — Mould (pseudonyms)

1. Build `pseudonyms.json` from real names in sources.
2. Play names must not be homophones or searchable variants of real names.
3. Preserve evidential traits (age, accent, appearance) in `preserved_traits[]`.
4. Run banned-token scan: no real names in play-reachable assets.

### Step F — JSON authoring

1. Write `case.json` → `trial.json` → `exhibits` → `ground_truth` → `truth_file`.
2. Every block gets `source: { source_id, locator }`.
3. Run validator: `./gradlew test --tests "*CaseIntegrity*"`.

### Step G — Sign-off

| Role | Checks |
|------|--------|
| Content Curator | Tabulation complete, I-1–I-8 |
| Engineer | Validator green |
| QA | Playthrough + reveal gate |
| Memory Steward | projectmem decisions logged |

---

## 6. C-000 pilot case (synthetic)

C-000 is **explicitly synthetic** — inclusion criteria I-2 and I-3 use the synthetic path:

- `case.json` includes `"synthetic": true`
- Sources cite "Pilot synthetic case — no historical persons"
- Used only to validate pipeline until Phase 4

---

## 7. Output checklist (PR description template)

Copy into every case-content PR:

```
## Case harness checklist
- [ ] Inclusion I-1–I-8 verified
- [ ] Exclusion E-1–E-7 scanned
- [ ] TABULATION.md complete
- [ ] Phase floors met
- [ ] Banned-token scan green
- [ ] Validator tests green
- [ ] projectmem decision logged
```

---

## 8. Escalation

| Situation | Action |
|-----------|--------|
| Source conflict | BLOCKED REPORT — do not guess |
| Schema vs harness conflict | Harness wins in pilot; log `pjm decision` |
| v3 spec vs pilot spec conflict | `PILOT-SPEC.md` wins until Phase 4 |
