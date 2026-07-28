# CodeRabbit setup (SimJury)

Flat-rate PR reviews via the [CodeRabbit GitHub App](https://github.com/apps/coderabbitai).
Repo config: [`.coderabbit.yaml`](../.coderabbit.yaml). Bot presence counts
`coderabbit` in the default OR-group (`sourcery|codex|cursor|coderabbit`).

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
gh api repos/yanniedog/simjury/pulls/<n>/reviews --jq '.[].user.login'
```

Reconfigure / dump resolved YAML on a PR: comment `@coderabbitai configuration`.

## Repo wiring (this PR)

| Piece | Purpose |
|-------|---------|
| `.coderabbit.yaml` | **Quiet** profile (high-severity only), **no walkthrough/summary**, draft PRs on, incremental review, path filters + SimJury path instructions |
| `scripts/lib/bot-wait-config.mjs` | `coderabbit` alias + default OR-group |
| `bot-presence-gate` | Env `SIMJURY_BOT_WAIT_REQUIRED=sourcery\|codex\|cursor\|coderabbit` |
| `pr-coderabbit-rate-limit-retry` | When CR posts “Review limit reached”, wait then `@coderabbitai review` |

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

To install on another repo, copy that single workflow file into `.github/workflows/`.

## Other active repos

Copy `.coderabbit.yaml` (trim path_instructions) and add `coderabbit` to each
repo’s `*_BOT_WAIT_REQUIRED` OR-group. See [`CROSS_REPO_BOT_MATRIX.md`](CROSS_REPO_BOT_MATRIX.md).
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
