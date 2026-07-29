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
# After the app is installed, the contract controller posts this on ready heads:
gh pr comment <n> --body "@coderabbitai full review"

# Expect author coderabbitai[bot] on a review with Actionable comments / inline findings
gh api repos/yanniedog/SimJury/pulls/<n>/reviews --jq '.[].user.login'
```

Reconfigure / dump resolved YAML on a PR: comment `@coderabbitai configuration`.

## Repo wiring (this PR)

| Piece | Purpose |
|-------|---------|
| `.coderabbit.yaml` | **Chill** profile; lean output; auto-review on ready PRs with **incremental** follow-ups; drafts off; exact legacy status on |
| `scripts/coderabbit-contract.mjs` | One full request per ready head when missing/skipped/rate-limit-due; never re-nudge in-flight reviews |
| `scripts/coderabbit-quota-queue.mjs` | Serialize open-PR full-review asks — at most one active request across the repo |
| `bot-presence-gate` | Runs trusted base code and blocks until exact-head `Review completed` + one current peer |
| `pr-request-bot-reviews` | Posts `@codex review` only; CodeRabbit has one controller |
| `pr-coderabbit-ensure-review` | Manual single-open-PR diagnostic; no scheduled fan-out |
| `pr-bot-close-guard` | Reopens PRs closed with outstanding CR/peer/thread obligations |

The source of truth is CodeRabbit's commit-status history for the current SHA.
Only `Review completed` passes. Rate limits, skipped reviews, command acks,
walkthrough text, and reviews of older heads do not pass.

No `chore:`/WIP title or bot-author name bypasses protected gates.

## Exact-head contract

Previous scheduled fan-out retried clean and merged PRs, exhausted quota, and
mistook comments for review proof. The replacement is one PR-scoped controller:

1. Drafts consume no CodeRabbit quota.
2. Ready/open PRs get one vendor auto-review (incremental on later pushes).
3. Controllers only post `@coderabbitai full review` for missing/skipped/rate-limit-due heads.
4. `Review queued` / `in progress` waits with **no** extra comments; `rate limited` waits until vendor due time.
5. On a brand-new head with **no** CodeRabbit status yet, wait ~3 minutes for vendor auto-review to claim the head before posting `@coderabbitai full review` (avoids double-spend when auto_review is on).
6. Player media under `site/app/public/media/**` stays reviewable so media-only PRs can still earn `Review completed`.
5. Across open PRs, `npm run pr:coderabbit-quota-queue` requests at most one full review at a time.
6. `Review completed` on that exact SHA passes; unresolved findings remain blocked
   by `bot-feedback-gate` and native conversation resolution.

Local helpers:

```sh
npm run pr:coderabbit-contract -- --pr <n> --dry-run
npm run pr:coderabbit-contract:verify
npm run pr:coderabbit-quota-queue -- --dry-run
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
| `@coderabbitai full review` | Complete review from scratch (preferred for gates / retries) |
| `@coderabbitai review` | Incremental review of new commits only |
| `@coderabbitai summary` | Summary only |
| `@coderabbitai configuration` | Dump resolved config |
| `@coderabbitai pause` / `resume` | Pause / resume auto-review on that PR |
| `@coderabbitai rate limit` | Show remaining allowance (does not consume a review) |
