# SimJury PR workflow

Human workflows: **PR → CI + bot QA gates → squash merge**.

## 1. Open a PR

Push a `cursor/*` branch and open a PR to `main`.

Chore PRs (`chore:` / `chore(scope):`) and bot-authored PRs skip bot gates automatically.

## 2. PR CI (`validate`)

The `ci` workflow runs docs/projectmem checks and `./gradlew test` (plus `:app:assembleDebug` when the Android module exists).

## 3. Bot presence gate (`bot-presence-gate`)

Waits until **gemini**, **codex**, and **sourcery** have posted on the PR since the wait anchor.

| Key | GitHub logins |
|-----|---------------|
| gemini | `gemini-code-assist[bot]`, `google-github-actions-bot[bot]`, … |
| codex | `chatgpt-codex-connector[bot]` |
| sourcery | `sourcery-ai[bot]` |

Codex does not auto-review on every repo. The `pr-request-bot-reviews` workflow posts `@codex review` once when Codex has not yet appeared. Install **ChatGPT Codex Connector** on the repository (Settings → Integrations → GitHub Apps). Manual fallback: comment `@codex review` on the PR.

Local pre-merge check:

```sh
npm run wait-for-bots -- --watch --pr <n>
```

Exit **0** = ready. Exit **2** = still waiting. Exit **1** = error or missing bots at cap.

Env: `SIMJURY_BOT_WAIT_REQUIRED=gemini,codex,sourcery` (fallback: `JCS2_BOT_WAIT_REQUIRED`, `AR_BOT_WAIT_REQUIRED`, `BOT_WAIT_REQUIRED`).

## 4. Bot feedback gate (`bot-feedback-gate`)

All substantive review threads must be **resolved** on GitHub before merge.

```sh
npm run pr:bot-feedback-check -- --pr <n>
```

## 5. Aggregate gate check

```sh
npm run pr:gates:check -- --pr <n>
npm run pr:gates:check -- --watch --pr <n>
```

## 6. Merge

When all gates pass:

```sh
gh pr merge <n> --auto --squash --delete-branch
```

See [`.github/MERGE_POLICY.md`](.github/MERGE_POLICY.md).

## Auto release when PR queue drains

AR-local parity: when a PR squash-merges to `main`, **pilot-auto-release-on-queue-drain** counts remaining open PRs (`gh pr list --state open --base main`). If **> 0**, it exits cleanly. If **0** (last PR in the queue landed), it bumps `versionName` patch in `pilot/app/build.gradle.kts` via `pilot/scripts/pilot-auto-release-on-drain.mjs`, commits, and **pushes directly to `main`**. It then dispatches **pilot-android-apk** (a `GITHUB_TOKEN` push does not re-trigger workflows). Concurrency group `pilot-auto-release-on-drain` (`cancel-in-progress: false`) serializes drain checks.

### Direct commit to main (one-time GitHub setup)

Add **GitHub Actions** to the `main` ruleset bypass list (Settings → Rules → Rulesets). Optionally scope to `.github/workflows/pilot-auto-release-on-queue-drain.yml`. If push fails, the drain script falls back to a gate-exempt bump PR (`scripts/lib/pr-pilot-auto-release-commit.mjs`).

Verify bypass is configured:

```sh
npm run github:bot-gates:operator
```

## Enable branch protection (one-time)

```sh
npm run github:bot-gates:operator
npm run repo-merge-settings:apply
npm run branch-protection:apply
```

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run wait-for-bots` | Poll until required bots posted |
| `npm run pr:bot-feedback-check` | Thread closure gate |
| `npm run pr:gates:check` | All merge gates |
| `npm run branch-protection:apply` | Apply legacy branch protection |
| `npm run repo-merge-settings:apply` | Squash-only repo settings |
| `npm run github:bot-gates:operator` | Setup helper + local verify |
| `npm run pilot:auto-release-commit:verify` | Auto-release push helper tests |

## Auto release (pilot APK)

When the PR queue to `main` drains, **pilot-auto-release-on-queue-drain** bumps the app version and dispatches **pilot-android-apk**. See [WORKFLOW.md](WORKFLOW.md#auto-release-when-pr-queue-drains). Requires **GitHub Actions** on the main ruleset bypass list for direct pushes.
