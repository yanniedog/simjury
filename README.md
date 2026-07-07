# SimJury Pilot

A dramatically simplified pilot for **SimJury** — a single-player, offline jury simulation built from real historical cases.

This repository is in **pilot phase**. The full v3 specification (`archive/simjury-build-spec-v3.md`) remains the long-term target; the pilot proves the core loop on a tiny case before scaling up.

## Quick start

```bash
cd pilot
./gradlew run --console=plain
./gradlew test --console=plain
```

## What exists today

| Area | Location | Phase |
|------|----------|-------|
| Pilot spec (authoritative for now) | `PILOT-SPEC.md` | 0 |
| Phased rollout | `ROADMAP.md` | 0 |
| Case selection & authoring harness | `CASE_HARNESS.md` | 0 |
| Agent roles & supervision | `AGENTS.md` | 0 |
| Project memory (projectmem) | `.projectmem/`, `CLAUDE.md` | 0 |
| JVM pilot app | `pilot/` | 1 |
| Full future spec (deferred) | `archive/simjury-build-spec-v3.md` | 4+ |

## Development workflow

1. **Branch** from `main` using `cursor/<descriptive-name>-61f6`.
2. **Open a small PR** — one concern per PR (docs, harness, app feature, CI).
3. **Resolve all CI checks** before merge; squash merge only.
4. **Use projectmem** — read `CLAUDE.md` at session start; log decisions and attempts via `pjm` or MCP tools.
5. **Follow the agent harness** in `AGENTS.md` and `CASE_HARNESS.md` when authoring or adapting cases.

## Branch protection

`main` is protected. All changes require:

- Pull request (no direct pushes)
- Passing CI (`validate` + **`bot-review-window`** — 8-minute bot review wait)
- All review threads resolved

See `.github/BRANCH_PROTECTION.md` for operator setup on GitHub.
