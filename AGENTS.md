# Agent Team Structure

Hierarchical development team for SimJury. Every agent session declares its **role** in the PR description and logs work to projectmem.

---

## Hierarchy

```
Orchestrator (Lead)
├── Architect
├── Content Curator
├── Engineer
├── QA
└── Memory Steward (projectmem)
```

### Orchestrator (Lead Agent)

- Owns PR scope, branch naming, and merge readiness
- Delegates to subagents; does not implement large diffs directly
- Ensures CI green and all review threads resolved before merge
- **Accountability:** final PR quality; squash merge only when gates pass

### Architect

- Schema, module boundaries, `PILOT-SPEC.md` / `ROADMAP.md` alignment
- Reviews cross-module impact before Engineer merges
- **Reports to:** Orchestrator
- **Deliverables:** ADRs via `pjm decision`, schema changes in small PRs

### Content Curator

- Owns `CASE_HARNESS.md` compliance
- Selects, tabulates, adapts case material — never invents testimony
- **Reports to:** Orchestrator
- **Deliverables:** `TABULATION.md`, case JSON, `BALANCE.md` (Phase 4+)

### Engineer

- Implements app code per `PILOT-SPEC.md`
- Matches existing conventions; minimal diffs
- **Reports to:** Architect for design; Orchestrator for delivery
- **Deliverables:** code + tests per PR

### QA

- Runs `./gradlew test`, manual pilot run, reveal-gate verification
- Files issues via `pjm log`; confirms fixes via `pjm fix`
- **Reports to:** Orchestrator
- **Deliverables:** test additions, CI fixes, gate sign-off in PR

### Memory Steward

- Ensures projectmem compliance every session
- Session start: `get_summary()`, `get_project_map()`, `get_instructions()`
- Session end: all decisions/attempts logged
- **Reports to:** Orchestrator
- **Deliverables:** updated `.projectmem/`, no direct `summary.md` edits

---

## Session protocol

### Start

1. Read `CLAUDE.md` (projectmem bridge)
2. Call projectmem MCP tools OR `pjm brief`
3. Read `PILOT-SPEC.md` + current phase in `ROADMAP.md`
4. Declare role and task in first commit/PR message

### PR automation (mandatory — no user prompt)

**Bot feedback is never optional.** Agents must address every actionable bot review comment and resolve every thread — without waiting for the user to ask. Treat open bot threads as a merge blocker equal to CI failure.

On every open PR the Orchestrator must automatically:

1. Open PR as **draft** first; mark ready only after initial CI run starts
2. Run `gh pr checks <n>` — fix failures and push until green
3. **Wait for `bot-presence-gate`** — run `npm run wait-for-bots -- --watch --pr <n>` until exit 0; do not merge while bots are missing
4. Read all bot review comments (`gh api repos/.../pulls/<n>/comments` and `/reviews`)
5. **Apply every valid fix**; reply on each thread confirming the fix (or why N/A)
6. **Resolve every review thread** via `.github/scripts/resolve-bot-threads.sh <n>` — never merge with open threads
7. Run `npm run pr:gates:check -- --pr <n>` — abort if exit non-zero
8. Run `.github/scripts/assert-pr-mergeable.sh <n>` — abort if it fails
9. Squash merge when **all** gates pass: `gh pr merge <n> --auto --squash --delete-branch`
10. Rebase stacked PRs onto `main` after upstream merge

**Never merge immediately after `validate` passes.** `bot-presence-gate` and `bot-feedback-gate` must also be green. See `WORKFLOW.md`.

### Backlog hygiene (mandatory — no user prompt)

When landing on `main` with no open PR, run `.github/scripts/audit-bot-feedback.sh` (defaults to PRs #4–#6 and any caller-supplied numbers). If merged PRs still have unresolved bot threads:

1. Implement missing fixes on a follow-up branch (do not edit merged PR branches in place)
2. Reply on each stale thread explaining the fix commit
3. Run `.github/scripts/resolve-bot-threads.sh <n>` for each affected PR
4. Do **not** consider bot feedback "done" until audit exits 0

### During work

| Event | Action |
|-------|--------|
| Before editing file | `precheck_file(path)` |
| Design choice | `pjm decision "…"` |
| Bug found | `pjm log "…" --at file:line` |
| Fix attempt | `pjm attempt "…" --failed\|--worked` |
| Case content change | Follow `CASE_HARNESS.md` checklist |

### End

1. `pjm show` — verify memory reflects session
2. Push branch; open/update PR
3. Respond to CI and review bots until all checks pass

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
2. CI `bot-presence-gate` — **success** (required bots posted; see `npm run wait-for-bots`)
3. CI `bot-feedback-gate` — **success** (review threads resolved)
4. Bot comments read and **fixed in code** (or explicitly acknowledged as N/A with reply)
5. `npm run pr:gates:check -- --pr <n>` exits 0
6. `assert-pr-mergeable.sh <pr>` passes
7. Case content PRs include harness checklist (if applicable)
8. projectmem decision logged for scope-affecting changes
9. PR size ≤ ~400 lines (split if larger)

---

## Anti-patterns (do not)

- Re-read entire `archive/simjury-build-spec-v3.md` each session — use projectmem + `PILOT-SPEC.md`
- Implement Phase 4+ features during Phase 1
- Edit `.projectmem/summary.md` directly
- Push directly to `main`
- Large multi-concern PRs
- Merge with unresolved bot review threads
- Wait for the user to ask before addressing bot feedback
