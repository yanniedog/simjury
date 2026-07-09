# CLAUDE.md

## Start here

This repo is in **Phase 4** (authoring historical Case 001 / Beck). Before working:

1. Read [`PHASE4-STATUS.md`](PHASE4-STATUS.md) — current state, remaining G-4 work, and the
   guardrails. It is the single source of truth for "where are we / what next".
2. Read the authority docs it points to, as needed: [`ROADMAP.md`](ROADMAP.md) (phase gates),
   [`CASE_HARNESS.md`](CASE_HARNESS.md) (case authoring rules + floors),
   [`PHASE4-PLAN.md`](PHASE4-PLAN.md) (PR breakdown), [`PILOT-SPEC.md`](PILOT-SPEC.md),
   [`WORKFLOW.md`](WORKFLOW.md) (PR bot gates).

## Non-negotiable rules (from CASE_HARNESS.md)

- **Never invent testimony or evidence.** Every block/exhibit/contradiction must trace to a
  `TABULATION.md` row + a real source. An empty locator is a gap — **STOP** and file a BLOCKED
  REPORT rather than filling it from memory.
- **No real names in play-reachable text (F-4).** The validator scans for banned tokens.
- **Pilot floors only** — never import v3 §10 quantities until Phase 5 is in scope.
- **One concern per PR, ≤ 400 lines, squash merge.** Wait for the bot gates (`WORKFLOW.md`).

## Build & test

```powershell
pilot\gradlew.bat -p pilot test        # build + all JVM tests (case-model + pilot)
```

> **Note:** projectmem (the old MCP memory layer this file used to mandate) is **disabled**.
> There is no `get_instructions()` / `get_summary()` / `precheck_file()` to call. Use
> `PHASE4-STATUS.md` as the project memory and keep it current as you work.
