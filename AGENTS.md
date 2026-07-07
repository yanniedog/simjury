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

1. CI workflow `ci` — **success**
2. All review threads — **resolved**
3. Case content PRs include harness checklist (if applicable)
4. projectmem decision logged for scope-affecting changes
5. PR size ≤ ~400 lines (split if larger)

---

## Anti-patterns (do not)

- Re-read entire `archive/simjury-build-spec-v3.md` each session — use projectmem + `PILOT-SPEC.md`
- Implement Phase 4+ features during Phase 1
- Edit `.projectmem/summary.md` directly
- Push directly to `main`
- Large multi-concern PRs
