# SimJury Rollout Roadmap

Phased delivery. **Do not skip phases.** Each phase ends with a gate PR that must pass CI and review before the next phase begins.

---

## Phase 0 — Foundation (current)

**Goal:** Governance, memory, harness, branch protection.

| Deliverable | Status |
|-------------|--------|
| `PILOT-SPEC.md` | Done |
| `CASE_HARNESS.md` | Done |
| `AGENTS.md` | Done |
| projectmem init + `CLAUDE.md` | Done |
| `.github/workflows/ci.yml` | Done |
| Branch protection docs | Done |
| Archive v3 spec | Done |

**Gate G-0:** CI green on `main`; projectmem populated; README accurate.

---

## Phase 1 — JVM Pilot App

**Goal:** End-to-end playable CLI loop on case C-000.

| Deliverable | PR scope |
|-------------|----------|
| Gradle JVM project in `pilot/` | Small PR |
| Case loader + validator | Small PR |
| C-000 synthetic case assets | Small PR |
| Game session (summons → reveal) | Small PR |
| Reveal gate + validator tests | Small PR |

**Gate G-1:**
- `./gradlew test` green in CI
- Manual run completes C-000
- `CASE_HARNESS.md` inclusion checklist signed off in PR description

---

## Phase 2 — Engine Extraction

**Goal:** Split pure Kotlin modules reusable by Android.

| Deliverable | PR scope |
|-------------|----------|
| `:case-model` module (schema + V-rules) | One PR |
| `:deliberation-core` skeleton (state machine stub) | One PR |
| Fixture case `C-999` for tests only | One PR |
| Pilot CLI refactored to use modules | One PR |

**Gate G-2:** Determinism test on stub engine; fixture validates.

---

## Phase 3 — Android Shell

**Goal:** Compose UI for trial reading + diary + vote + reveal.

| Deliverable | PR scope |
|-------------|----------|
| `:app` module skeleton | One PR |
| Navigation + dark theme tokens | One PR |
| Trial reader screens | One PR |
| Diary + verdict + reveal screens | One PR |
| DataStore save model | One PR |

**Gate G-3:** Emulator run of C-000; reveal gating on device.

---

## Phase 4 — First Historical Case

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
| projectmem `add_decision` for phase transitions | Audit trail |
| Resolve all bot comments before merge | PR gates |

---

## Decision log

Record phase transitions and scope changes in projectmem:

```bash
pjm decision "Phase N complete — G-N passed" --at "ROADMAP.md"
```
