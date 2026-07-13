# SimJury Rollout Roadmap

Phased delivery. **Do not skip phases.** Each phase ends with a gate PR that must pass CI and review before the next phase begins.

---

## Track D — The Daily Docket (current, primary)

**Owner pivot 2026-07-13 — see [`DAILY-PIVOT.md`](DAILY-PIVOT.md) for the decision record
and the D0–D9 delivery ladder.** Daily synthetic 2026-relevant cases (8–10 min, fiction,
interactive seeded jury room) on simjury.com, absorbing the `simjury-daily` repo's
pipeline into `site/app/`. Phases 4–6 below belong to the **historical track**, which is
**parked** (c_001 stays live at `/play`; G-4 and Android work paused).

---

## Phase 0 — Foundation

**Goal:** Governance, memory, harness, branch protection.

**G-0:** Met — merged to `main`.

---

## Phase 1 — JVM Pilot App (current)

**Goal:** End-to-end playable CLI loop on case C-000.

| Deliverable | Status |
|-------------|--------|
| Gradle JVM project in `pilot/` | Done |
| `:case-model` module (schema + V-rules) | Done |
| Case loader + validator | Done |
| C-000 synthetic case assets | Done |
| Game session (summons → reveal) | Done |
| Reveal gate + validator tests | Done |

**G-1:** Met — merged to `main`.

---

## Phase 2 — Engine Extraction

**Goal:** Split pure Kotlin modules reusable by Android.

| Deliverable | Status |
|-------------|--------|
| `:case-model` module (schema + V-rules) | Done |
| `:deliberation-core` skeleton (state machine stub) | Done |
| Fixture case `C-999` for tests only | Done |
| Pilot CLI refactored to use modules | Done |

**Gate G-2:** Met — determinism test on stub engine; C-999 fixture validates.

---

## Phase 3 — Android Shell (current)

**Goal:** Compose UI for trial reading + diary + vote + reveal.

| Deliverable | Status |
|-------------|--------|
| `:app` module skeleton | Done |
| Navigation + dark theme tokens | Done |
| Trial reader screens | Done |
| Diary + verdict + reveal screens | Done |
| DataStore save model | Done |

**Gate G-3:** ✅ Code architecture verified; device testing deferred (see `G3-SIGNOFF.md`).

---

## Phase 4 — First Historical Case

**Planning:** [`PHASE4-PLAN.md`](PHASE4-PLAN.md) — Beck source acquisition, harness floors, PR breakdown, G-4 gate.

**Goal:** Case 001 (Beck) authored per harness, not per raw v3 quantities.

| Deliverable | PR scope |
|-------------|----------|
| Source document acquisition (EX-1) | Operator PR / handoff |
| Condensed Beck case (harness floors, not v3 floors) | Multiple small PRs |
| Human clearance sign-off | Operator |
| Balance test | One PR |

**Gate G-4:** Full playthrough; `BALANCE.md`; clearance complete.

**Note:** Re-read `archive/simjury-build-spec-v3.md` Section 8.6 only after G-3 passes. The harness (`CASE_HARNESS.md`) sets **pilot-appropriate floors**, not v3's 110-block minimum.

---

## Phase 5 — Deliberation + Scoring

**Goal:** 11 jurors, deliberation phases, process score, share card.

Port v3 Sections 9, 12, 13 incrementally — one subsystem per PR.

**Gate G-5:** Four terminal outcomes on device; scoring tests green.

---

## Phase 6 — Release

**Goal:** Accessibility, licensing, Play submission.

Follow v3 Part B where not contradicted by pilot decisions recorded in projectmem.

**Gate G-6:** Signed AAB; `CONFORMANCE.md` populated from v3 checklist.

---

## PR discipline

| Rule | Rationale |
|------|-----------|
| Max ~400 lines changed per PR | Reviewable; CI fast |
| One gate concern per PR | Clear rollback |
| Squash merge to `main` | Linear history |
| **Wait for bot gates before merge** | `bot-presence-gate` + `bot-feedback-gate` (see `WORKFLOW.md`) |
| projectmem `add_decision` for phase transitions | Audit trail |
| Resolve all bot comments before merge | PR gates |

---

## Decision log

Record phase transitions and scope changes in projectmem:

```bash
pjm decision "Phase N complete — G-N passed" --at "ROADMAP.md"
```
