# Cross-repo bot matrix alignment

Required bots on human work PRs (presence gate): **gemini**, **codex**, **sourcery**.

| Repository | `*_BOT_WAIT_REQUIRED` | Auto `@codex review` | Status |
|------------|------------------------|----------------------|--------|
| [cursor-global-workflow](https://github.com/yanniedog/cursor-global-workflow) | `gemini,codex,sourcery` (template) | `pr-request-bot-reviews` template + bootstrap | OPEN — [PR #3](https://github.com/yanniedog/cursor-global-workflow/pull/3); apply act-or-park pack |
| [jcs2-mod](https://github.com/yanniedog/jcs2-mod) | `JCS2_BOT_WAIT_REQUIRED=gemini,codex,sourcery` | `pr-request-bot-reviews` workflow | OPEN — [PR #19](https://github.com/yanniedog/jcs2-mod/pull/19); apply act-or-park pack |
| [simjury](https://github.com/yanniedog/simjury) | `SIMJURY_BOT_WAIT_REQUIRED=gemini,codex,sourcery` | `pr-request-bot-reviews` workflow | MERGED presence; **act-or-park in-tree** (`npm run pr:arm-and-park`) |
| [AR-local](https://github.com/yanniedog/AR-local) | `AR_BOT_WAIT_REQUIRED=gemini,codex,sourcery` | `pr-request-bot-reviews` workflow | OPEN — [PR #436](https://github.com/yanniedog/AR-local/pull/436); apply act-or-park pack |

Only these four repos use `pr-bot-presence-gate.yml`. Installing Codex on **All repositories** also lets non-gated repositories request a Codex review with `@codex review`.

## Act-or-park (token efficiency)

Agents must not `--watch` bot gates. Portable pack: [`docs/cross-repo-patches/cursor-global-workflow/`](cross-repo-patches/cursor-global-workflow/README.md).

`cursor[bot]` cannot push to the three non-simjury repos from simjury cloud — operator (or a cloud agent with write access on those remotes) applies the pack.

## Operator: install Codex GitHub App (all repos)

1. Open https://github.com/apps/chatgpt-codex-connector/installations/new
2. Choose **All repositories** for the `yanniedog` account (preferred), or select every active repo.
3. Save.

Without the app, `bot-presence-gate` waits until timeout for `chatgpt-codex-connector[bot]`. The `pr-request-bot-reviews` workflow posts `@codex review` automatically but Codex must still be installed.
