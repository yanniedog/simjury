# CodeRabbit setup (SimJury)

Flat-rate PR reviews via the [CodeRabbit GitHub App](https://github.com/apps/coderabbitai).
Repo config: [`.coderabbit.yaml`](../.coderabbit.yaml). Bot presence **requires**
`coderabbit` as a hard merge-protection slot (`sourcery|codex|cursor,coderabbit`).

## Finish GitHub App install (required once)

Partial UI signup is not enough — CodeRabbit will not post on `yanniedog/*`
until the app can access the repos.

1. Open **https://github.com/apps/coderabbitai/installations/new**
2. Choose the **yanniedog** account.
3. Select **All repositories** (covers current + future repos).
4. Confirm permissions and install / save.
5. In [CodeRabbit dashboard](https://app.coderabbit.ai/) confirm the repos show
   as enabled for review (Pro if you want full PR reviews on private/public work).

Verify on any open PR:

```sh
# After the app is installed, either wait for auto-review or:
gh pr comment <n> --body "@coderabbitai review"

# Expect author coderabbitai[bot] on a review or walkthrough comment
gh api repos/yanniedog/SimJury/pulls/<n>/reviews --jq '.[].user.login'
```

Reconfigure / dump resolved YAML on a PR: comment `@coderabbitai configuration`.

## Repo wiring (this PR)

| Piece | Purpose |
|-------|---------|
| `.coderabbit.yaml` | **Quiet** profile (high-severity only), **no walkthrough/summary**, draft PRs on, incremental review, path filters + SimJury path instructions |
| `scripts/lib/bot-wait-config.mjs` | `coderabbit` alias + mandatory presence slot |
| `bot-presence-gate` | Env `SIMJURY_BOT_WAIT_REQUIRED=sourcery\|codex\|cursor,coderabbit` (CodeRabbit mandatory) |
| `pr-request-bot-reviews` | Posts `@coderabbitai review` when CR has not appeared (defers if rate-limited) |
| `pr-coderabbit-rate-limit-retry` | On “Review limit reached”, waits ≤120m then `@coderabbitai review` |
| `pr-coderabbit-review-recovery` | Hourly: reopen closed / recover merged PRs that only got rate-limit or failed CR |
| `pr-bot-close-guard` | Reopens PRs closed with outstanding CR/peer/thread obligations |

Rate-limit notices do **not** satisfy `bot-presence-gate`. Presence stays red until a
substantive CodeRabbit review lands; the rate-limit Action owns the open-PR retry clock.
The hourly recovery Action covers **closed/merged** PRs that slipped through with only a
rate-limit or failed review (at most one `@coderabbitai review` per hour until CR succeeds).

Chore / WIP titles are skipped by CodeRabbit (`ignore_title_keywords`) and are still
gate-exempt in SimJury scripts.

## Auto-retry after rate limit

CodeRabbit does **not** resume on its own after a rate-limit comment. Workflow
[`.github/workflows/pr-coderabbit-rate-limit-retry.yml`](../.github/workflows/pr-coderabbit-rate-limit-retry.yml)
is **self-contained** (no repo scripts). It listens for those comments, sleeps until
“Next review available in N minutes” (+2m buffer, max 120m), then posts:

```text
<!-- simjury-coderabbit-rate-limit-retry -->
@coderabbitai review
```

Concurrency uses `cancel-in-progress: false` so ordinary PR comments cannot cancel a
sleeping waiter. Duplicate rate-limit runs self-skip when a retry is already armed,
CodeRabbit already reviewed, or a newer rate-limit comment owns the window.

Install on all other active repos (same policy everywhere):

```sh
npm run coderabbit:rate-limit-retry:install-all
# or pack:
# docs/cross-repo-patches/coderabbit-rate-limit-retry/
```

Local helpers (simjury):

```sh
npm run pr:coderabbit-rate-limit-retry -- --pr <n>
npm run pr:coderabbit-rate-limit-retry:verify
npm run pr:coderabbit-review-recovery -- --dry-run
npm run pr:coderabbit-review-recovery:verify
```

## Hourly recovery (closed / merged)

Workflow [`.github/workflows/pr-coderabbit-review-recovery.yml`](../.github/workflows/pr-coderabbit-review-recovery.yml)
runs every hour and on `workflow_dispatch`:

1. Scan recently closed/merged PRs (default 14-day lookback)
2. Skip PRs that already have a substantive CodeRabbit review
3. **Closed (unmerged):** reopen the PR
4. **Merged:** GitHub cannot reopen merged PRs — keep requesting review on the merged PR
5. Post `@coderabbitai review` at most **once per hour** until CR leaves a proper review

Manual:

```sh
npm run pr:coderabbit-review-recovery -- --pr 232
npm run pr:coderabbit-review-recovery -- --lookback-days 14 --dry-run
```

## Other active repos

**Treat every active repo the same.** Copy `.coderabbit.yaml` (trim
path_instructions) and set each repo’s `*_BOT_WAIT_REQUIRED` to
`sourcery|codex|cursor,coderabbit`. See [`CROSS_REPO_BOT_MATRIX.md`](CROSS_REPO_BOT_MATRIX.md)
and the [`cross-repo-patches/AR-app/`](cross-repo-patches/AR-app/README.md) pack.
With **All repositories** on the GitHub App, new repos get reviews without
re-installing the app; add a local `.coderabbit.yaml` when you want repo-specific rules.

## Manual commands

| Comment | Effect |
|---------|--------|
| `@coderabbitai review` | Full review now |
| `@coderabbitai summary` | Summary only |
| `@coderabbitai configuration` | Dump resolved config |
| `@coderabbitai pause` / `resume` | Pause / resume auto-review on that PR |
| `@coderabbitai rate limit` | Show remaining allowance (does not consume a review) |
