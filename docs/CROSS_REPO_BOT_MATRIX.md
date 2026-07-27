# Cross-repo bot matrix alignment

## Required presence (OR-group)

Default: **`sourcery|codex|cursor`** — any one review bot satisfies the presence slot.

| Why | Detail |
|-----|--------|
| Sourcery flaky | Skips some docs/setup PRs (seen on AR-app #37/#38/#41) |
| Gemini sunset | Consumer Code Assist posts a sunset notice only — treated as **noise**, not required |
| Cursor Automation | Often the only real review (`cursor` / `cursor[bot]`) |

Syntax: commas = ALL-of slots; `|` = OR within a slot.

| Repository | `*_BOT_WAIT_REQUIRED` | Notes |
|------------|------------------------|-------|
| [simjury](https://github.com/yanniedog/simjury) | `sourcery\|codex\|cursor` | In-tree OR-groups + `npm run pr:arm-and-park` |
| [AR-app](https://github.com/yanniedog/AR-app) | `sourcery\|cursor` (recommended) | Apply pack: [`cross-repo-patches/AR-app/`](cross-repo-patches/AR-app/README.md) |
| [AR-local](https://github.com/yanniedog/AR-local) | `sourcery\|codex\|cursor` | Apply same OR-group + retries |
| [jcs2-mod](https://github.com/yanniedog/jcs2-mod) | `sourcery\|codex\|cursor` | Apply same |
| [cursor-global-workflow](https://github.com/yanniedog/cursor-global-workflow) | template default | Mirror from simjury |

## Presence gate retries (required)

Do **not** fail the required check on the first `wait-for-bots` exit 2. Race: gate runs on `opened` before bots post → sticky red check. Use in-job retries (simjury: 12×30s) and keep event re-fires on review/comment. `cancel-in-progress: false` on concurrency groups.

## Act-or-park (token efficiency)

Agents must not `--watch` bot gates. Portable pack: [`docs/cross-repo-patches/cursor-global-workflow/`](cross-repo-patches/cursor-global-workflow/README.md).

`cursor[bot]` cannot push to the three non-simjury repos from simjury cloud — operator (or a cloud agent with write access on those remotes) applies the pack.

## Operator: install Codex GitHub App (all repos)

1. Open https://github.com/apps/chatgpt-codex-connector/installations/new
2. Choose **All repositories** for the `yanniedog` account (preferred), or select every active repo.
3. Save.

Without the app, prefer counting **Cursor Automation** via the `cursor` key in the OR-group.
