# SimJury Pilot

A dramatically simplified pilot for **SimJury** — a single-player, offline jury simulation built from real historical cases.

This repository is in **pilot phase**. The full v3 specification (`archive/simjury-build-spec-v3.md`) remains the long-term target; the pilot proves the core loop on a tiny case before scaling up.

## Quick start

```bash
cd pilot
./gradlew run --console=plain
./gradlew test --console=plain
```

## Android preview APK

After a PR merges to `main` (and the PR queue drains), **pilot-auto-release-on-queue-drain** bumps the app version and **pilot-android-apk** publishes to GitHub Releases:

| Asset | URL |
|-------|-----|
| Rolling APK | `https://github.com/yanniedog/simjury/releases/download/app-apk-latest/app-preview.apk` |
| Update manifest | `https://github.com/yanniedog/simjury/releases/download/app-apk-latest/app-apk-latest.json` |
| Install page | `https://github.com/yanniedog/simjury/releases/download/app-apk-latest/install.html` |

The installed app checks the manifest on launch and offers an in-app update (AR-local parity). Enable **Install unknown apps** for `SimJury` when prompted.

Manual workflow dispatch: **Actions → pilot-android-apk → Run workflow**.


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
- Passing CI (`validate` + **`bot-presence-gate`** + **`bot-feedback-gate`** — see `WORKFLOW.md`)
- All review threads resolved

See `.github/BRANCH_PROTECTION.md` for operator setup on GitHub.
