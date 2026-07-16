# Cross-repo bot matrix alignment

Required bots on human work PRs (presence gate): **gemini**, **codex**, **sourcery**.

| Repository | `*_BOT_WAIT_REQUIRED` | Auto `@codex review` | Status |
|------------|------------------------|----------------------|--------|
| [cursor-global-workflow](https://github.com/yanniedog/cursor-global-workflow) | `gemini,codex,sourcery` (template) | `pr-request-bot-reviews` template + bootstrap | OPEN — [PR #3](https://github.com/yanniedog/cursor-global-workflow/pull/3) |
| [jcs2-mod](https://github.com/yanniedog/jcs2-mod) | `JCS2_BOT_WAIT_REQUIRED=gemini,codex,sourcery` | `pr-request-bot-reviews` workflow | OPEN — [PR #19](https://github.com/yanniedog/jcs2-mod/pull/19) |
| [simjury](https://github.com/yanniedog/simjury) | `SIMJURY_BOT_WAIT_REQUIRED=gemini,codex,sourcery` | `pr-request-bot-reviews` workflow | MERGED — [PR #15](https://github.com/yanniedog/simjury/pull/15) |
| [AR-local](https://github.com/yanniedog/AR-local) | `AR_BOT_WAIT_REQUIRED=gemini,codex,sourcery` | `pr-request-bot-reviews` workflow | OPEN — [PR #436](https://github.com/yanniedog/AR-local/pull/436) |

Only these four repos use `pr-bot-presence-gate.yml`. Installing Codex on **All repositories** also lets non-gated repositories request a Codex review with `@codex review`.

## Operator: install Codex GitHub App (all repos)

1. Open https://github.com/apps/chatgpt-codex-connector/installations/new
   (personal account: **Settings → Applications → Installed GitHub Apps**;
   organization: **Organization settings → Installed GitHub Apps**)
2. Choose **All repositories** for the `yanniedog` account (preferred), or select every active repo.
3. Save.

Without the app, `bot-presence-gate` waits until timeout for `chatgpt-codex-connector[bot]`. The `pr-request-bot-reviews` workflow posts `@codex review` automatically but Codex must still be installed.
