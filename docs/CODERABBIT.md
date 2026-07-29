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
| `pr-coderabbit-rate-limit-retry` | On rate-limit: **no sleep** — posts immediately only if wait already elapsed |
| `pr-coderabbit-ensure-review` | Every **15 minutes**: open due retries + closed reopen + merged follow-up until a *proper* CR review |
| `pr-coderabbit-review-recovery` | Alias of ensure-review (hourly schedule kept for bookmarks) |
| `pr-bot-close-guard` | Reopens PRs closed with outstanding CR/peer/thread obligations |

Rate-limit notices, command acks, and walkthrough/summarize text without review
signals do **not** satisfy `bot-presence-gate` or ensure-review.
A proper review means Actionable comments / inline findings / approve-changes — not “I’ll review”.

Chore / WIP titles are skipped by CodeRabbit (`ignore_title_keywords`) and are still
gate-exempt in SimJury scripts.

## Ensure review (no GHA sleep)

Long sleeps in Actions were cancelled before posting (audit: 0 successful completes).
Durable path:

1. Rate-limit comment fires `pr-coderabbit-rate-limit-retry` → **if-due only** (no sleep)
2. `pr-coderabbit-ensure-review` runs every 15 minutes:
   - **Open:** when quota wait elapsed / ack-only / missing proper review → `@coderabbitai review` (≤1 / 15m)
   - **Closed:** reopen + request (≤1 / hour)
   - **Merged:** request on merged PR (≤1 / hour)
3. Stops only after a proper CR review

```text
<!-- simjury-coderabbit-ensure-review -->
@coderabbitai review
```

Local helpers:

```sh
npm run pr:coderabbit-rate-limit-retry -- --pr <n> --if-due
npm run pr:coderabbit-ensure-review -- --dry-run
npm run pr:coderabbit-ensure-review:verify
npm run pr:coderabbit-review-recovery:verify
```

## Hourly recovery alias

Workflow [`.github/workflows/pr-coderabbit-review-recovery.yml`](../.github/workflows/pr-coderabbit-review-recovery.yml)
is an alias of ensure-review (same concurrency group).
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
