# SimJury PR workflow

Human workflows: **PR → CI + bot QA gates → squash merge**.

Agent contract: **act or park — never poll.** See [Act or park](#act-or-park--never-poll).

## 1. Open a PR

Push a `cursor/*` branch and open a PR to `main`.

Chore PRs (`chore:` / `chore(scope):`) and bot-authored PRs skip bot gates automatically.

## 2. PR CI (`validate`)

The `ci` workflow runs docs/projectmem checks and site-related gate script checks.
**Android / JVM pilot steps are frozen** (skipped until further notice — `DAILY-PIVOT.md` #5);
do not re-enable `:app:assembleDebug` / `./gradlew test` in `ci.yml` without an owner unlock.

## 3. Bot presence gate (`bot-presence-gate`)

Waits until **gemini**, **codex**, and **sourcery** have posted on the PR since the wait anchor.

| Key | GitHub logins |
|-----|---------------|
| gemini | `gemini-code-assist[bot]`, `google-github-actions-bot[bot]`, … |
| codex | `chatgpt-codex-connector[bot]` |
| sourcery | `sourcery-ai[bot]` |

Codex does not auto-review on every repo. The `pr-request-bot-reviews` workflow posts `@codex review` once when Codex has not yet appeared. Install **ChatGPT Codex Connector** on the repository (Settings → Integrations → GitHub Apps). Manual fallback: comment `@codex review` on the PR.

Local single-shot check (agents):

```sh
npm run wait-for-bots -- --pr <n>          # exit 0 ready | 2 waiting | 1 error
npm run pr:arm-and-park -- --pr <n>      # preferred — arms auto-merge + classifies
```

**Do not** run `wait-for-bots --watch` inside an agent session. CI may poll; agents park.

Env: `SIMJURY_BOT_WAIT_REQUIRED=gemini,codex,sourcery` (fallback: `JCS2_BOT_WAIT_REQUIRED`, `AR_BOT_WAIT_REQUIRED`, `BOT_WAIT_REQUIRED`).

## 4. Bot feedback gate (`bot-feedback-gate`)

All substantive review threads must be **resolved** on GitHub before merge.

```sh
npm run pr:bot-feedback-check -- --pr <n>
```

## 5. Act or park — never poll

Agents burn tokens when they sleep-poll for bots. Use one command:

```sh
npm run pr:arm-and-park -- --pr <n>
```

| Exit | Meaning | Agent action |
|------|---------|--------------|
| **0** | Gates green; auto-merge armed | Done for this turn (merge pending on GitHub) |
| **2** | **Parked** — waiting on bots/CI only | **END TURN** — do not `--watch` |
| **3** | **Actionable** — CI fail / threads / conflicts | Fix, push, re-run arm-and-park |
| **1** | Hard error | Fix auth/tooling |

What arm-and-park does (one shot, no loops):

1. Sync branch when behind (`gh pr update-branch`)
2. Enable squash auto-merge (`gh pr merge --auto --squash --delete-branch`)
3. Classify merge gates as ready / waiting / actionable

Aggregate single-shot audit (no watch in agents):

```sh
npm run pr:gates:check -- --pr <n>
```

`--watch` exists for **humans / CI only** — not for Cursor agents.

## 6. Merge

When gates are green, auto-merge (armed by `pr:arm-and-park`) lands the squash. Manual:

```sh
gh pr merge <n> --auto --squash --delete-branch
# or: npm run pr:merge -- --pr <n>
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
| `npm run pr:arm-and-park` | **Preferred agent entry** — arm auto-merge + classify (no poll) |
| `npm run wait-for-bots` | Single-shot bot presence (CI may `--watch`; agents must not) |
| `npm run pr:bot-feedback-check` | Thread closure gate |
| `npm run pr:gates:check` | All merge gates (single shot) |
| `npm run pr:merge` | Enable squash auto-merge |
| `npm run branch-protection:apply` | Apply legacy branch protection |
| `npm run repo-merge-settings:apply` | Squash-only repo settings |
| `npm run github:bot-gates:operator` | Setup helper + local verify |

## Cross-repo sync

Canonical agent rules for all projects live in [cursor-global-workflow](https://github.com/yanniedog/cursor-global-workflow). Portable patches for this efficiency protocol: [`docs/cross-repo-patches/cursor-global-workflow/`](docs/cross-repo-patches/cursor-global-workflow/README.md).

## Auto release (pilot APK)

When the PR queue to `main` drains, **pilot-auto-release-on-queue-drain** bumps the app version and dispatches **pilot-android-apk**. Requires **GitHub Actions** on the main ruleset bypass list for direct pushes.
