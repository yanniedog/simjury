# Agent Team Structure

Hierarchical development team for SimJury. Every agent session declares its **role** in the PR description.

---

## Active surface (binding)

**simjury.com only.** All agent work targets the Daily Docket web app in `site/app/`
(and related site/CI/docs). See `CLAUDE.md` and `DAILY-PIVOT.md`.

### Android / JVM pilot — FROZEN until further notice

Do **not** develop, refactor, “fix,” or release the Android/JVM pilot (`pilot/`,
`pilot-android-apk`, APK auto-release, emulator smoke, Compose UI, Gradle modules)
unless the owner explicitly lifts this freeze in writing. Parked handoff:
`PHASE4-STATUS.md`. PRs that touch Android app code or re-enable Android CI/release
workflows are out of scope and must be closed.

Allowed without lifting the freeze: incidental path mentions in docs that still point
agents *away* from Android, and leaving `pilot/` sources in the tree untouched.

---

## Hierarchy

```
Orchestrator (Lead)
├── Architect
├── Content Curator
├── Engineer
├── QA
```

### Orchestrator (Lead Agent)

- Owns PR scope, branch naming, and merge readiness
- Delegates to subagents; does not implement large diffs directly
- Ensures CI green and all review threads resolved before merge
- **Accountability:** final PR quality; squash merge only when gates pass
- Rejects or closes any PR that resumes Android/pilot work while the freeze holds

### Architect

- Schema, module boundaries, Daily Docket / `ROADMAP.md` alignment for `site/app/`
- Reviews cross-module impact before Engineer merges
- **Reports to:** Orchestrator
- **Deliverables:** ADRs and schema changes in small PRs

### Content Curator

- Owns Daily Docket case quality (`docs/DAILY-CASES.md`, banned-token / fiction gates)
- Historical harness (`CASE_HARNESS.md`) only if the owner reopens that track
- **Reports to:** Orchestrator
- **Deliverables:** case JSON, quality notes (historical: `TABULATION.md` / `BALANCE.md`)

### Engineer

- Implements **simjury.com** / `site/app/` per `DAILY-PIVOT.md` and site decisions
- Matches existing conventions; minimal diffs
- **Reports to:** Architect for design; Orchestrator for delivery
- **Deliverables:** code + tests per PR
- Does **not** work in `pilot/` while Android is frozen

### QA

- Runs `site/app` checks (`npm test`, `validate:cases`, manual Daily Docket playthrough)
- Files issues and confirms fixes through tests
- **Reports to:** Orchestrator
- **Deliverables:** test additions, CI fixes, gate sign-off in PR
- Does **not** run Android device QA or Gradle pilot work while the freeze holds

---

## Session protocol

### Start

1. Read `CLAUDE.md` and `DAILY-PIVOT.md`
2. Confirm work is for **simjury.com** / `site/app/` (abort if the task is Android/pilot)
3. Declare role and task in first commit/PR message

### PR automation (mandatory — no user prompt)

**Bot feedback is never optional.** Agents must address every actionable bot review comment and resolve every thread — without waiting for the user to ask. Treat open bot threads as a merge blocker equal to CI failure.

**Act or park — never poll.** Agents must not run `wait-for-bots --watch`, `pr:gates:check --watch`, `gh pr checks --watch`, or sleep-until-bots loops. Those burn tokens while GitHub owns the clock. Use one-shot `npm run pr:arm-and-park`.

On every open PR the Orchestrator must automatically:

1. Open PR as **draft** first; mark ready only after initial CI run starts
2. Run `npm run pr:arm-and-park -- --pr <n>` (single shot; marks ready + arms auto-merge if still draft):
 - **exit 0** — gates green; auto-merge armed; finish any remaining post-merge ownership
 - **exit 2** — waiting on bots/CI only; auto-merge armed; **keep ownership** via self-wake (no `--watch` busy-poll, and do **not** hand follow-up to the user)
 - **exit 3** — **ACTIONABLE** — fix CI failures, conflicts, or unresolved review threads, push, re-run arm-and-park
3. When actionable: read bot review comments (`gh api` reviews/comments); **apply every valid fix**; reply on each thread; run `.github/scripts/resolve-bot-threads.sh <n>`
4. Re-arm: `npm run pr:arm-and-park -- --pr <n>` after each fix push
5. Squash auto-merge is armed by arm-and-park (`gh pr merge --auto --squash --delete-branch`); stay owned until merge completes
6. Rebase stacked PRs onto `main` after upstream merge (actionable when behind)

**Never merge immediately after `validate` passes.** `bot-presence-gate` and `bot-feedback-gate` must also be green. See `WORKFLOW.md`.

**Forbidden agent loops:** `npm run wait-for-bots -- --watch`, `npm run pr:gates:check -- --watch`, `while sleep; do wait-for-bots; done`. CI workflows may poll; agents must not.

### Backlog hygiene (mandatory — no user prompt)

When landing on `main` with no open PR, run `.github/scripts/audit-bot-feedback.sh` (defaults to PRs #4–#6 and any caller-supplied numbers). If merged PRs still have unresolved bot threads:

1. Implement missing fixes on a follow-up branch (do not edit merged PR branches in place)
2. Reply on each stale thread explaining the fix commit
3. Run `.github/scripts/resolve-bot-threads.sh <n>` for each affected PR
4. Do **not** consider bot feedback "done" until audit exits 0

### During work

| Event | Action |
|-------|--------|
| Case content change | Follow `CASE_HARNESS.md` checklist |

### End

1. Push branch; open/update PR
2. Run `npm run pr:arm-and-park -- --pr <n>` once
3. Exit 2 → keep ownership with self-wake until merge. Exit 3 → fix actionable work, re-arm. Exit 0 → finish remaining ownership (post-merge jobs included).

---

## Subagent delegation rules

| Task type | Delegate to | Max parallel |
|-----------|-------------|--------------|
| Broad codebase search | explore subagent | 2 |
| Isolated feature PR | generalPurpose subagent | 1 per PR |
| CI failure diagnosis | debug subagent | 1 |
| Case sourcing research | Content Curator (+ explore) | 1 |
| PR review | bugbot (on request only) | 1 |

Orchestrator **must** synthesize subagent output; never merge unreviewed subagent diffs blindly.

---

## PR gates (mandatory)

No squash merge to `main` unless:

1. CI `validate` — **success**
2. CI `bot-presence-gate` — **success** (required bots posted)
3. CI `bot-feedback-gate` — **success** (review threads resolved)
4. Bot comments read and **fixed in code** (or explicitly acknowledged as N/A with reply)
5. `npm run pr:arm-and-park -- --pr <n>` exits **0** (or exit **2** parked with auto-merge armed while waiting — not a merge claim)
6. Case content PRs include harness checklist (if applicable)
7. PR size ≤ ~400 lines (split if larger)

Single-shot audits (no agent watch): `npm run pr:gates:check -- --pr <n>` and `.github/scripts/assert-pr-mergeable.sh <pr>`.

---

## Anti-patterns (do not)

- Develop, test, or release the Android/JVM pilot while the freeze holds
- Re-enable `pilot-android-apk` / APK auto-release without an owner unlock
- Re-read entire `archive/simjury-build-spec-v3.md` each session — use `DAILY-PIVOT.md` / `PILOT-SPEC.md` only if the owner reopens that track
- Implement Phase 4+ historical/Android features during the Daily Docket track
- Push directly to `main`
- Large multi-concern PRs
- Merge with unresolved bot review threads
- Wait for the user to ask before addressing bot feedback
- Agent `--watch` / sleep-poll babysitting of bot gates (use `pr:arm-and-park`)
