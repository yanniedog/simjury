# G-4 Gate Sign-Off — Case 001 (Beck / *The List*)

**Date:** 2026-07-09  
**Role:** QA + Engineer (automated evidence); operator steps remain human-only  
**Authority:** [`PHASE4-STATUS.md`](PHASE4-STATUS.md), [`PHASE4-PLAN.md`](PHASE4-PLAN.md) §1, [`ROADMAP.md`](ROADMAP.md)

---

## Executive summary

**Status:** **CONDITIONAL — not G-4 complete.** Automated R4 playthrough evidence is green on `main`. G-4 still requires **R3 human clearance** and **operator device/emulator playthrough** before the R5 gate PR.

| Criterion | Evidence | Status |
|-----------|----------|--------|
| Full playthrough (automated CLI) | `C001PlaythroughTest` | ✅ |
| Full playthrough (automated Android unit) | `C001ViewModelPlaythroughTest` | ✅ |
| Debug case picker → C-001 (Compose) | `MainActivityCasePickerTest` | ✅ (this PR) |
| `BALANCE.md` | Present + `BalanceCitationsTest` | ✅ (operator counter-sign pending) |
| Human clearance | `case.json` → `cleared_by` | ❌ still `PENDING HUMAN SIGN-OFF` |
| Device/emulator QA | Manual checklist below | ❌ pending (no KVM in cloud) |

> **TRAP:** Normal `CaseValidator.validate` accepts the clearance placeholder. Green CI ≠ cleared. Only `validateOperatorClearanceComplete` rejects it — wire that in **R5** after R3.

---

## 1. Automated evidence (R4)

### 1.1 CLI playthrough — `C001PlaythroughTest`

```bash
cd pilot && ./gradlew :test --tests '*C001Playthrough*'
```

Asserts: summons → all episode items → diary → vote → reveal; F-4 banned tokens absent from pre-reveal output; historical disclaimer; operator clearance gate still blocked while placeholder remains.

### 1.2 ViewModel playthrough — `C001ViewModelPlaythroughTest`

```bash
cd pilot && ./gradlew :app:testDebugUnitTest --tests '*C001ViewModelPlaythrough*'
```

Robolectric drives `PilotViewModel` through the same C-001 loop and scans play-reachable UI fields for F-4 tokens.

### 1.3 Debug case picker — `MainActivityCasePickerTest` + `CaseCatalog` fix

```bash
cd pilot && ./gradlew :app:testDebugUnitTest --tests '*MainActivityCasePicker*' --tests '*CaseCatalog*'
```

`CaseCatalog` now accepts both device directory listings and Robolectric’s flattened
`c_000/case.json` asset paths (previously the debug picker was empty under unit tests).
Compose test starts on default `c_000`, asserts picker chips for both cases, switches to
**The List**, and asserts the four-episode hub (`E-01`…`E-04`).

### 1.4 Content floors

Harness floors for C-001 are met (see [`PHASE4-STATUS.md`](PHASE4-STATUS.md) §1). Ground truth K-01…K-03 and `BALANCE.md` are merged.

---

## 2. Operator device / emulator QA (still required)

Cloud agents cannot run the x86_64 emulator without `/dev/kvm`. Use a local emulator or physical device.

### Build options

**Debug (recommended for QA — case picker on summons):**

```bash
cd pilot
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

On the summons screen, under **Debug case**, tap **The List**, then **Enter the courtroom**.

**Release / no picker (bake in C-001):**

```bash
cd pilot
./gradlew :app:assembleRelease -PpilotCaseId=c_001
# or assembleDebug -PpilotCaseId=c_001
adb install -r app/build/outputs/apk/release/app-release.apk
```

### Checklist (tick on device)

- [ ] Summons shows play title **The List** (not Pocket Watch) after selecting C-001
- [ ] Four episodes unlock in order; all items readable
- [ ] Diary → vote → reveal completes without crash
- [ ] **No** real names / years (Beck, 1896, etc.) appear **before** reveal
- [ ] After reveal, truth layers + pseudonym restore appear
- [ ] Kill/relaunch mid-case restores progress (optional but recommended)

Record results in the R5 G-4 gate PR comment (pass/fail + device model / API level).

---

## 3. Operator clearance (R3) — human only

Edit [`pilot/src/main/resources/cases/c_001/case.json`](pilot/src/main/resources/cases/c_001/case.json) only after completing the checklist in [`PHASE4-STATUS.md`](PHASE4-STATUS.md) §2 R3:

1. Confirm all clearance booleans remain `true`
2. Replace `descendants_risk_note` unfinished wording with a completed note
3. Counter-sign [`BALANCE.md`](pilot/src/main/resources/cases/c_001/BALANCE.md) attestation
4. Spot-check F-4 (no real names pre-reveal)
5. Set `cleared_by` = real name, `cleared_date` = ISO today

Then R5 wires `CaseValidator.validateOperatorClearanceComplete` into the gate and flips this document to **PASS**.

---

## 4. R5 gate PR (after R3 + device QA)

1. Clearance fields no longer placeholders
2. Call `validateOperatorClearanceComplete` from the G-4 gate path / test (not from everyday content `validate` until cleared)
3. Attach device QA notes + this sign-off
4. Follow [`WORKFLOW.md`](WORKFLOW.md) bot gates before squash merge

---

## 5. Environmental limits (cloud)

Same as G-3: no `/dev/kvm` → no local emulator UI run here. CI `pilot-android-apk` smoke covers install/launch of the **default** release APK (`c_000`), not a full C-001 playthrough.
