# SimJury PR workflow

Human workflows: **PR → CI + bot QA gates → squash merge**.

## 1. Open a PR

Push a `cursor/*` branch and open a PR to `main`.

Chore PRs (`chore:` / `chore(scope):`) and bot-authored PRs skip bot gates automatically.

## 2. PR CI (`validate`)

The `ci` workflow runs docs/projectmem checks and `./gradlew test` (plus `:app:assembleDebug` when the Android module exists).

## 3. Bot presence gate (`bot-presence-gate`)

Waits until **gemini** and **sourcery** have posted on the PR since the wait anchor.

| Key | GitHub logins |
|-----|---------------|
| gemini | `gemini-code-assist[bot]`, `google-github-actions-bot[bot]`, … |
| sourcery | `sourcery-ai[bot]` |

Local pre-merge check:

```sh
npm run wait-for-bots -- --watch --pr <n>
```

Exit **0** = ready. Exit **2** = still waiting. Exit **1** = error or missing bots at cap.

Env: `SIMJURY_BOT_WAIT_REQUIRED=gemini,sourcery` (fallback: `JCS2_BOT_WAIT_REQUIRED`, `AR_BOT_WAIT_REQUIRED`, `BOT_WAIT_REQUIRED`).

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
