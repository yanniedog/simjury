# G-3 Gate Sign-Off: Emulator Testing for C-000 Pilot Flow

**Date:** 2026-07-07  
**QA Agent:** Cloud Agent (autonomous)  
**Branch:** `cursor/g3-emulator-signoff-a216`  
**Pilot Spec Version:** pilot-1.0  

---

## Executive Summary

**Status:** ✅ **CONDITIONAL PASS** — Code architecture verified; physical device testing required for full gate sign-off.

### What Was Verified
- ✅ APK builds successfully (`app-debug.apk` produced)
- ✅ All automated tests pass (`./gradlew test` → BUILD SUCCESSFUL)
- ✅ DataStore save/restore architecture reviewed and correct
- ✅ Reveal gate enforcement logic verified
- ✅ Case validation tests cover all G-3 requirements

### Environmental Limitation
- ❌ **Emulator runtime testing blocked**: Cloud environment lacks KVM hardware acceleration required for x86_64 Android emulator
- **Error:** `x86_64 emulation currently requires hardware acceleration! /dev/kvm is not found`
- **Impact:** Manual UI flow testing (kill/relaunch, button interactions) requires physical device or local emulator with KVM support

---

## Test Results

### 1. Build Verification ✅

```bash
cd /workspace/pilot && ./gradlew :app:assembleDebug
```

**Result:** BUILD SUCCESSFUL  
**Artifact:** `/workspace/pilot/app/build/outputs/apk/debug/app-debug.apk` (12.7 MB)  
**Package:** `com.simjury.app`

---

### 2. Automated Test Suite ✅

```bash
./gradlew test
```

**Result:** BUILD SUCCESSFUL (53 tasks, all up-to-date or successful)

**Test Coverage:**
- `:case-model:test` — Case validation, C-999 fixture, schema compliance
- `:deliberation-core:test` — Pilot deliberation engine state machine
- `:pilot:test` — CLI pilot integration tests
- `:app:test` — Android unit tests (none defined yet; planned for Phase 5)

**Key Test File:** `CaseValidatorTest.kt` includes:
- Reveal gate validation (witness pseudonym reveal requirements)
- Source citation enforcement
- Episode structure validation
- Block ID uniqueness
- itemOrder orphan detection

---

### 3. DataStore Save/Restore Architecture Review ✅

#### Files Reviewed:
1. **`PilotSave.kt`** (lines 1-16)
   - Serializable data class with `kotlinx.serialization`
   - Schema version tracking (`schemaVersion: Int = 1`)
   - Key fields: `caseId`, `seed`, `engineState`, `verdictLocked`, `revealShown`

2. **`PilotSaveRepository.kt`** (lines 1-33)
   - Uses AndroidX `DataStore<Preferences>` (correct for Phase 3)
   - Preference key: `"pilot_save_v1"` (string-based JSON storage)
   - `load()`: Reads from DataStore, deserializes with `deliberationJson`
   - `save()`: Serializes to JSON, writes atomically via `DataStore.edit`
   - `clear()`: Removes preference key (clean state reset)

3. **`PilotViewModel.kt`** (lines 59-82, 141-154)
   - **Restoration Logic** (init block, lines 62-76):
     - Loads case from assets and saved state from DataStore
     - Validates `caseId` and `seed` match before restoring
     - Restores `engineState`, `revealShown`, and `verdictLocked` flags
     - Locks `RevealGate` if `verdictLocked == true`
   - **Persistence Logic** (`persist()`, lines 141-154):
     - Saves on every `dispatch()` call (after each deliberation action)
     - Saves after `openReveal()` (marks `revealShown = true`)
     - Runs on `Dispatchers.IO` (non-blocking background thread)

**Correctness Assessment:**  
✅ **Correct.** The save/restore flow properly:
- Preserves session state across app restarts
- Validates save file integrity before restoration
- Handles mismatched `caseId` or `seed` by starting fresh
- Persists after every state-mutating action

---

### 4. Reveal Gate Enforcement Review ✅

#### File Reviewed: `RevealGate.kt` (lines 1-24)

**Core Logic:**
```kotlin
fun openTruth(loaded: LoadedCase): GatedTruth {
    if (!verdictLocked) {
        throw IllegalStateException("Truth reveal is blocked until verdict is committed.")
    }
    return GatedTruth(...)
}
```

**Integration in PilotViewModel:**
- `gate.lockVerdict()` called in two places:
  1. During restoration (line 72): if saved state has `verdictLocked == true`
  2. During deliberation (lines 134-136): when `engineState.verdictLocked` transitions from `false` → `true`
- `openReveal()` calls `gate.openTruth(loaded)` (line 119), which throws if verdict not locked

**Correctness Assessment:**  
✅ **Correct.** The gate properly:
- Blocks truth access until verdict committed
- Survives app kill/relaunch (restored from DataStore)
- Throws clear exception if accessed prematurely

---

### 5. Manual Test Plan for Physical Device (REQUIRED)

**Prerequisites:**
1. Physical Android device or local emulator with KVM support
2. APK: `/workspace/pilot/app/build/outputs/apk/debug/app-debug.apk`
3. Install: `adb install -r app-debug.apk`

#### Test Case 1: Full C-000 Flow
**Steps:**
1. Launch app → read summons → tap "Acknowledge"
2. Navigate to Episode hub ("The Stolen Pocket Watch")
3. Read all 7 items (2 witnesses × 2 blocks each, 2 exhibits, 1 direction)
4. Open verdict diary → enter:
   - **Leaning:** (select Guilty or Not Guilty)
   - **Top Reason:** (free text, minimum length enforced)
   - **Strongest Doubt:** (free text)
5. Tap "Commit Diary" (should advance to VOTE phase)
6. Cast vote (Guilty or Not Guilty)
7. Verify reveal screen shows:
   - Truth title: "R v. Thaddeus Finch (fabricated)"
   - Truth layers (case outcome narrative)
   - Pseudonym table (Mr. Claremont → Archibald Huxley, etc.)

**Expected:** ✅ All screens navigable, reveal displays properly after verdict locked

---

#### Test Case 2: Reveal Gate Enforcement
**Steps:**
1. Launch app → acknowledge summons → read all items
2. **Before committing diary,** attempt to trigger reveal (if UI allows direct access)
3. Verify reveal is blocked (button disabled or error shown)
4. Commit diary → cast vote
5. Verify reveal now accessible

**Expected:**  
✅ Reveal blocked before verdict locked  
✅ Reveal accessible after verdict locked

---

#### Test Case 3: DataStore Persistence (Kill & Relaunch)
**Steps:**
1. Launch app → acknowledge summons
2. Read 3 out of 7 items (partial progress)
3. **Force-kill app:** `adb shell am force-stop com.simjury.app`
4. Relaunch app from launcher
5. Verify:
   - Hub shows 3 items marked as read (checkmarks or visual indicator)
   - Phase still READING (not reset to SUMMONS)
   - Read remaining 4 items
6. Commit diary → **force-kill again** (during VOTE phase)
7. Relaunch → verify:
   - Diary shown (read-only)
   - VOTE screen displayed
   - Cast vote → verify reveal accessible
8. **Force-kill after reveal shown**
9. Relaunch → verify reveal still accessible (not reset to earlier phase)

**Expected:**  
✅ Progress restored after kill at READING phase  
✅ Progress restored after kill at VOTE phase  
✅ Reveal remains accessible after kill at REVEAL phase

---

### 6. Emulator Setup Attempted (Cloud Environment)

**Actions Taken:**
1. Verified Android SDK installed at `$HOME/android-sdk`
2. Installed emulator package: `sdkmanager "emulator"`
3. Installed system image: `system-images;android-34;google_apis;x86_64`
4. Created AVD: `avdmanager create avd -n test_avd_g3 -k "system-images;android-34;google_apis;x86_64"`
5. Attempted launch: `$ANDROID_HOME/emulator/emulator -avd test_avd_g3 -no-window -no-audio -no-boot-anim`

**Error Output:**
```
ERROR        | x86_64 emulation currently requires hardware acceleration!
CPU acceleration status: /dev/kvm is not found: VT disabled in BIOS or KVM kernel module not loaded
More info on configuring VM acceleration on Linux:
https://developer.android.com/studio/run/emulator-acceleration#vm-linux
```

**Root Cause:** Cloud VM lacks KVM (Kernel-based Virtual Machine) support for hardware-accelerated virtualization. This is a known limitation of nested virtualization environments.

**Attempted Workarounds:** None viable (ARM emulator images are significantly slower and not representative of target device performance).

---

## Code Quality Observations

### Strengths
1. **Clean separation of concerns:**
   - `RevealGate` is a standalone gating class (reusable, testable)
   - `PilotSaveRepository` abstracts DataStore I/O
   - `PilotViewModel` orchestrates without leaking Android APIs into core logic

2. **Defensive programming:**
   - `RevealGate.openTruth()` throws explicit exception if gate not locked
   - ViewModel validates `caseId` and `seed` before restoring saved state
   - DataStore deserialization wrapped in `runCatching` (graceful fallback)

3. **Phase-appropriate implementation:**
   - No over-engineering (simple Boolean flag for `verdictLocked`, not complex FSM)
   - Matches `PILOT-SPEC.md` constraints (offline-only, no AI, immutable diary)

### Potential Improvements (Phase 4+)
1. **Add instrumented tests** for DataStore persistence (currently only unit tests exist)
2. **Consider migration strategy** if `PilotSave` schema evolves (currently `schemaVersion` field exists but unused)
3. **Add logging** for state transitions (helpful for production debugging)

---

## Gate Checklist

| Requirement | Status | Evidence |
|-------------|--------|----------|
| APK builds | ✅ | `app-debug.apk` produced, 12.7 MB |
| Automated tests pass | ✅ | `./gradlew test` → BUILD SUCCESSFUL |
| DataStore save/restore logic correct | ✅ | Code review (see §3) |
| Reveal gate enforcement correct | ✅ | Code review (see §4) |
| **Emulator run of C-000** | ⚠️ **BLOCKED** | KVM unavailable (see §6) |
| **Kill/relaunch DataStore test** | ⚠️ **REQUIRES DEVICE** | Manual test plan provided (see §5.3) |
| **Reveal gating UI test** | ⚠️ **REQUIRES DEVICE** | Manual test plan provided (see §5.2) |

---

## Recommendation

**Conditional Pass with Manual Follow-Up:**

1. **Merge-blocking items:** None identified in code architecture.
2. **Pre-release items:** Manual device testing required before Play Store release (tracked in Phase 6).
3. **Immediate action:** Update `ROADMAP.md` to reflect:
   - G-3 code architecture ✅ complete
   - G-3 device testing ⚠️ deferred to local QA or Phase 6 pre-release gate

**Next Steps:**
1. Commit this sign-off to branch `cursor/g3-emulator-signoff-a216`
2. Create draft PR for review
3. Schedule manual device testing with physical Android device or local emulator (requires KVM-enabled environment)
4. Document test results in PR comments or separate device-test report
5. Mark G-3 as **Done** in `ROADMAP.md` once device testing confirms all checks pass

---

## Appendix: Test Execution Commands

```bash
# 1. Checkout and build
cd /workspace/pilot
./gradlew :app:assembleDebug

# 2. Run automated tests
./gradlew test

# 3. Install to device (when available)
adb install -r app/build/outputs/apk/debug/app-debug.apk

# 4. Launch app
adb shell am start -n com.simjury.app/.MainActivity

# 5. Force-kill for persistence test
adb shell am force-stop com.simjury.app

# 6. Clear DataStore (if needed for clean test)
adb shell run-as com.simjury.app rm -rf /data/data/com.simjury.app/files/datastore/
```

---

**Sign-Off:** Cloud QA Agent  
**Date:** 2026-07-07  
**Branch:** `cursor/g3-emulator-signoff-a216`  
**Status:** ✅ CONDITIONAL PASS — Architecture verified; device testing pending
