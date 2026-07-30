# Cross-repo bot matrix alignment

## Required presence (merge protection)

**All active repos use the same default:** **`sourcery|codex|cursor,coderabbit`**

| Slot | Rule |
|------|------|
| `sourcery\|codex\|cursor` | At least one peer review bot (Sourcery may skip docs/setup) |
| `coderabbit` | **Mandatory** — CodeRabbit is never OR-skippable |

| Why | Detail |
|-----|--------|
| Sourcery flaky | Skips some docs/setup PRs (seen on AR-app #37/#38/#41) — keep in peer OR only |
| Gemini | API-keyed `Automated Gemini Code Review` workflow — advisory, `continue-on-error`, never required. The consumer Code Assist **app** is sunset and has been removed from the fleet entirely, so its caution banner is not a bot event |
| Cursor Automation | Peer review (`cursor` / `cursor[bot]`) |
| CodeRabbit | Hard merge gate (`coderabbitai[bot]`) — [`CODERABBIT.md`](CODERABBIT.md) |

Syntax: commas = ALL-of slots; `|` = OR within a slot.

| Repository | `*_BOT_WAIT_REQUIRED` | Notes |
|------------|------------------------|-------|
| [SimJury](https://github.com/yanniedog/SimJury) | `sourcery\|codex\|cursor,coderabbit` | Canonical; close-guard + arm-and-park |
| [AR-app](https://github.com/yanniedog/AR-app) | `sourcery\|codex\|cursor,coderabbit` | Same slots — pack: [`cross-repo-patches/AR-app/`](cross-repo-patches/AR-app/README.md) |
| [AR-local](https://github.com/yanniedog/AR-local) | `sourcery\|codex\|cursor,coderabbit` | Same |
| [jcs2-mod](https://github.com/yanniedog/jcs2-mod) | `sourcery\|codex\|cursor,coderabbit` | Same |
| [cursor-global-workflow](https://github.com/yanniedog/cursor-global-workflow) | template default | Mirror from SimJury |

## Presence gate (single-shot)

Evaluate `wait-for-bots` **once** per run (no sleep-poll). Gate re-fires on review/comment/ci; agents park with `npm run pr:arm-and-park -- --pr <n>`. `cancel-in-progress: false` on concurrency groups.

## Act-or-park (token efficiency)

Agents must not `--watch` bot gates. Portable pack: [`docs/cross-repo-patches/cursor-global-workflow/`](cross-repo-patches/cursor-global-workflow/README.md).

`cursor[bot]` cannot push to the three non-SimJury repos from SimJury cloud — operator (or a cloud agent with write access on those remotes) applies the pack.

## Operator: install CodeRabbit GitHub App (all repos)

1. Open https://github.com/apps/coderabbitai/installations/new
2. Choose **All repositories** for the `yanniedog` account (preferred), or select every active repo.
3. Confirm repos are enabled in https://app.coderabbit.ai/
4. Details: [`CODERABBIT.md`](CODERABBIT.md)

## Operator: install Codex GitHub App (all repos)

1. Open https://github.com/apps/chatgpt-codex-connector/installations/new
2. Choose **All repositories** for the `yanniedog` account (preferred), or select every active repo.
3. Save.

Without Codex, peer slot can still pass via **Sourcery** or **Cursor Automation**;
**CodeRabbit remains mandatory** for merge.
