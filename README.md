# SimJury — The Daily Docket

SimJury's primary product is **The Daily Docket**: one fictional, contemporary case per
day with a deterministic interactive jury room, playable at
[simjury.com/today](https://simjury.com/today/). The older JVM/Android pilot and
historical Case 001 track remain in the repository but are parked; see
[`DAILY-PIVOT.md`](DAILY-PIVOT.md).

**Public site:** [simjury.com](https://simjury.com) (Cloudflare Worker `simjury-web` in `site/`).

## Daily Docket quick start

```bash
cd site/app
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run validate:cases
npm run build
```

The Cloudflare site wrapper is verified from the repository root with
`npm run site:check`. Parked pilot tests remain available via
`pilot/gradlew.bat -p pilot test` on Windows.

## Cloud checkout readiness

Use Node 24 (pinned in `.node-version`) and run the read-only preflight from the
repository root:

```bash
npm run cloud:bootstrap -- --check
```

On a fresh checkout, install both locked web dependency trees and recheck them:

```bash
npm run cloud:bootstrap -- --install
```

The bootstrap verifies a topic-branch Git checkout, a reachable and dry-run-pushable
`origin`, GitHub CLI installation and authentication, and the complete `site` plus
`site/app` dependency trees.
Authenticate with `gh auth login` or inject `GH_TOKEN` as a cloud secret. Never put
tokens in repository files, `.env`, command-line arguments, or Git configuration.

## Android preview APK

After a PR merges to `main` and the **PR queue drains** (no other open PRs to `main`), **pilot-auto-release-on-queue-drain** bumps `versionName` in `pilot/app/build.gradle.kts` and **pilot-android-apk** publishes to GitHub Releases. This matches [AR-local](https://github.com/yanniedog/AR-local) `mobile-auto-release-on-queue-drain` behaviour: one release per drained merge batch, not per intermediate PR while others are still open.

| Asset | URL |
|-------|-----|
| Install page | [simjury.com/install](https://simjury.com/install/) |
| Rolling APK | `https://github.com/yanniedog/simjury/releases/download/app-apk-latest/app-preview.apk` |
| Update manifest | `https://github.com/yanniedog/simjury/releases/download/app-apk-latest/app-apk-latest.json` |
| Install page (GitHub mirror) | `https://github.com/yanniedog/simjury/releases/download/app-apk-latest/install.html` |

The installed app checks the manifest on launch and offers an in-app update (AR-local parity). Enable **Install unknown apps** for `SimJury` when prompted.

Manual recovery: **Actions → pilot-auto-release-on-queue-drain → Run workflow** (re-bump if missed), or **Actions → pilot-android-apk → Run workflow** (build only).

**One-time operator setup:** GitHub Actions must be on the `main` ruleset bypass list so the drain workflow can push version bumps directly. See [WORKFLOW.md](WORKFLOW.md#auto-release-when-pr-queue-drains).


| Area | Location | Phase |
|------|----------|-------|
| Daily Docket decision record | `DAILY-PIVOT.md` | Active |
| Daily case authoring system | `docs/DAILY-CASES.md` | Active |
| Daily web app | `site/app/` | Active |
| Phased rollout | `ROADMAP.md` | Active + parked tracks |
| Historical case harness | `CASE_HARNESS.md` | Parked |
| Growth & cold-start playbook | `GROWTH.md` | Future |
| Agent roles & supervision | `AGENTS.md` | 0 |
| JVM/Android pilot | `pilot/` | Parked |
| Full future spec | `archive/simjury-build-spec-v3.md` | Deferred |

## Development workflow

1. **Branch** from `main` using `codex/<descriptive-name>`.
2. **Open a small PR** — one concern per PR (docs, harness, app feature, CI).
3. **Resolve all CI checks** before merge; squash merge only.
4. **Read `CLAUDE.md` first** for the current authority hierarchy and track status.
5. **Follow the relevant harness**: `docs/DAILY-CASES.md` for fictional daily cases;
   `CASE_HARNESS.md` only for the parked historical track.

## Branch protection

`main` must be protected. Repository operators should enforce:

- Pull request (no direct pushes)
- Passing CI (`validate` + **`bot-presence-gate`** + **`bot-feedback-gate`** — see `WORKFLOW.md`)
- All review threads resolved

See `.github/BRANCH_PROTECTION.md` for operator setup on GitHub.
