# Phase 4 Status & Handoff — Case 001 (Beck)

**Last verified:** 2026-07-09 against `main` (post P4-8 / P4-10). **CI on `main`: green.**

> **Progress 2026-07-09:** R1 (ground truth) and R2 (`BALANCE.md`) are **merged**.
> R4 CLI playthrough evidence + operator-clearance gate helper landed (this PR).
> Remaining for G-4: **R3 (human clearance), R4 device QA, R5 (gate PR)** — see §2.

**Read these for authority (do not re-derive):** [`ROADMAP.md`](ROADMAP.md) (Phase 4),
[`PHASE4-PLAN.md`](PHASE4-PLAN.md) (PR breakdown), [`CASE_HARNESS.md`](CASE_HARNESS.md)
(floors + rules), [`PILOT-SPEC.md`](PILOT-SPEC.md).

> **Memory note:** the projectmem MCP layer that `CLAUDE.md` calls "MANDATORY" is
> **DISABLED as of 2026-07-09.** Those tools are not available — **ignore the
> "projectmem (MANDATORY)" / session-start-trio instructions in `CLAUDE.md`.**
> This file is the handoff instead. Keep it current by editing it directly.

---

## 1. Where Phase 4 stands

Merged: **P4-0 … P4-9 and P4-11**. Case `c_001` assets are authored and validating in CI.

Content vs harness floors ([`CASE_HARNESS.md`](CASE_HARNESS.md) §4):

| Item | Floor | `c_001` now | Status |
|------|-------|-------------|--------|
| Witnesses | 6–9 | 8 (W-01…W-08) | ✅ |
| Testimony blocks | ≥ 60 | 67 | ✅ |
| Exhibits | 8–12 | 8 (X-01…X-08) | ✅ at floor |
| Episodes | 3–5 | 4 (E-01…E-04) | ✅ |
| Directions | 4–5 | 4 (D-01…D-04) | ✅ |
| Sources | ≥ 4 | 4 (S-01…S-04) | ✅ at floor |
| Contradictions (ground truth) | ≥ 3 | 3 (K-01…K-03) | ✅ **R1 merged** |
| `BALANCE.md` | required | present | ✅ **R2 merged** |
| truth_file layers | 4 | present | ✅ (P4-9) |

Assets live in [`pilot/src/main/resources/cases/c_001/`](pilot/src/main/resources/cases/c_001/).
Tests: [`C001SkeletonTest.kt`](pilot/src/test/kotlin/simjury/pilot/C001SkeletonTest.kt) (load /
witnesses / directions / intros / truth-file / exhibits / item-order / **ground truth**),
[`BalanceCitationsTest.kt`](pilot/src/test/kotlin/simjury/pilot/BalanceCitationsTest.kt) (balance
citations resolve), and [`CaseValidatorTest.kt`](pilot/case-model/src/test/kotlin/simjury/casemodel/CaseValidatorTest.kt)
(**ground-truth floor + structural negatives**) — all green.

---

## 2. Remaining work for the G-4 gate

G-4 criteria ([`PHASE4-PLAN.md`](PHASE4-PLAN.md) §1): **device playthrough + `BALANCE.md` + human clearance complete.**

Do these in order. Each is one small PR (≤ 400 lines, one concern, squash merge).

### R1 — Ground truth K-01…K-03  ✅ DONE (merged)

Implemented 2026-07-09:

- **Schema:** `Contradiction(id, kind, blockRefs, exhibitRefs, note, source)` + `ground_truth`
  on `TrialFile` — [`CaseModels.kt`](pilot/case-model/src/main/kotlin/simjury/casemodel/CaseModels.kt).
- **Validator:** historical floor **≥ 3**, valid `kind ∈ {real_decisive, real_immaterial, illusory}`,
  every `block_refs`/`exhibit_refs` must resolve, non-blank note + valid source —
  [`CaseValidator.kt`](pilot/case-model/src/main/kotlin/simjury/casemodel/CaseValidator.kt).
- **JSON:** K-01 `real_decisive` (ID conditions vs certainty; W-01/W-03/W-05 + X-06), K-02
  `real_immaterial` (Garner valuation shift), K-03 `illusory` (disguised-hand) — all anchored to
  already-authored blocks, sourced to S-01, in [`trial.json`](pilot/src/main/resources/cases/c_001/trial.json).
  Tabulation rows 32–34 updated.
- **Tests:** `C001SkeletonTest` (positive) + four `CaseValidatorTest` negatives + fixture updated.

### R2 — `BALANCE.md`  ✅ DONE (merged)

Implemented 2026-07-09:

- [`BALANCE.md`](pilot/src/main/resources/cases/c_001/BALANCE.md): ~300-word guilt and acquittal
  arguments (13+ distinct item citations each), trial-record only, + AD-1 balance attestation.
- [`BalanceCitationsTest.kt`](pilot/src/test/kotlin/simjury/pilot/BalanceCitationsTest.kt): fails if
  any cited `T-*`/`X-*`/`D-*` doesn't exist in `trial.json`, or either side cites < 5 distinct items.

> **Operator counter-sign still needed:** the attestation line ends "pending operator counter-sign
> at G-4" — a human must confirm the balance is fair (part of R3 review).

### R3 — Operator clearance sign-off  ⟵ HUMAN ONLY, an LLM cannot do this

In [`case.json`](pilot/src/main/resources/cases/c_001/case.json), `clearance.cleared_by` is still
`"PENDING HUMAN SIGN-OFF"` and `descendants_risk_note` still says "to be reviewed".

> **TRAP:** the validator only checks these fields are **non-blank** — it does **not** reject the
> `"PENDING HUMAN SIGN-OFF"` placeholder. **Green tests ≠ cleared.** Never mark G-4 done on tests alone.

**Operator checklist (do all, then edit `case.json`):**

- [ ] Confirm all clearance booleans remain true for the final content (they are, in JSON).
- [ ] Review descendants / reputational risk for a c.1896 fraud trial; replace `descendants_risk_note`
      "to be reviewed…" with a real completed note.
- [ ] Read [`BALANCE.md`](pilot/src/main/resources/cases/c_001/BALANCE.md) and confirm the
      condensation is genuinely balanced (harness I-8); counter-sign the attestation line.
- [ ] Spot-check no real names / years leak pre-reveal (the F-4 scanner enforces this, but confirm).
- [ ] Set `clearance.cleared_by` = your real name and `clearance.cleared_date` = today (ISO).

### R4 — Device playthrough QA  (G-4 criterion)

**CLI evidence (automated):** `C001PlaythroughTest` runs the full JVM loop on `c_001`
(summons → all episode items → diary → vote → reveal) and asserts F-4 banned tokens are absent
from pre-reveal output. `GameSession` now seeds `expectedItemIds` (parity with Android) and uses
a historical disclaimer for non-synthetic cases.

**Device QA (still required for G-4):** `c_001` is selected by the build flag
`BuildConfig.PILOT_CASE_ID`
([`AssetCaseLoader.kt`](pilot/app/src/main/kotlin/simjury/app/data/AssetCaseLoader.kt)), **not** a
runtime picker. Build with `-PpilotCaseId=c_001`, run on emulator/device, and verify: episodes →
diary → vote → reveal, and **no real names** (Beck / 1896 / etc.) appear pre-reveal. The
`pilot-android-apk` emulator smoke gate has been flaky (commit `13ca72b`) — if it's red, rule that
out before assuming a content regression.

**Operator clearance helper:** `CaseValidator.validateOperatorClearanceComplete` rejects
`PENDING HUMAN SIGN-OFF` / unfinished descendants notes. Wire it into the G-4 gate PR (R5) after
R3 — do **not** call it from normal `validate` (content PRs must stay green while clearance is
pending).

### R5 — G-4 gate PR  (P4-12)

Bundle the evidence (playthrough proof, `BALANCE.md`, clearance complete, CI green). Follow
[`WORKFLOW.md`](WORKFLOW.md) bot gates (`bot-presence-gate` + `bot-feedback-gate`) before merge.

---

## 3. Optional — allowed to skip at G-4 (floors already met)

- **W-09** defence witness (harness floor of 6–9 is met with 8). Add only if the record honestly supports it; else
  document the skip in `TABULATION.md`.
- **X-09/X-10** exhibits (8 is at floor).
- **D-05** deadlock direction — stub, deferred to Phase 5.
- Juror authored lines — **out of scope until Phase 5 / G-5** (see [`PHASE4-PLAN.md`](PHASE4-PLAN.md) §3).

---

## 4. Non-negotiable rules ([`CASE_HARNESS.md`](CASE_HARNESS.md))

- **Never invent testimony.** Every block/exhibit/contradiction traces to a `TABULATION.md` row +
  source. Empty locator = gap = **STOP** (BLOCKED REPORT).
- **No real names in play-reachable text (F-4).** The validator scans for `beck`, `1896`, etc. plus
  each pseudonym's real name.
- **Pilot floors only** — never import v3 §10 quantities (110 blocks, 12–16 exhibits) until Phase 5.
- **One concern per PR, ≤ 400 lines, squash merge.**
- **No post-trial / truth_file facts leaking into trial-phase JSON (AD-5).**

---

## 5. Fast commands (Windows PowerShell)

```powershell
pilot\gradlew.bat -p pilot test                                   # build + all tests
pilot\gradlew.bat -p pilot test --tests "*CaseIntegrity*" --tests "*C001*"   # case validation only
gh run list --branch main                                         # CI status
```

---

*Keep this file current: when you finish an R-item, tick it here in the same PR.*
