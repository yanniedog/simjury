# Cross-repo bot matrix alignment

Required bots on human work PRs (presence gate): **gemini**, **codex**, **sourcery**.

| Repository | `*_BOT_WAIT_REQUIRED` | Auto `@codex review` | Status |
|------------|------------------------|----------------------|--------|
| [cursor-global-workflow](https://github.com/yanniedog/cursor-global-workflow) | `gemini,codex,sourcery` (template) | add `pr-request-bot-reviews.yml` | Template OK; sync workflow |
| [jcs2-mod](https://github.com/yanniedog/jcs2-mod) | `JCS2_BOT_WAIT_REQUIRED=gemini,codex,sourcery` | manual `@codex review` | OK |
| [simjury](https://github.com/yanniedog/simjury) | `SIMJURY_BOT_WAIT_REQUIRED=gemini,codex,sourcery` | `pr-request-bot-reviews` workflow | PR #15 |
| [AR-local](https://github.com/yanniedog/AR-local) | was `gemini` only | none yet | **Operator apply** — see `docs/cross-repo-patches/AR-local/` |

Only these four repos use `pr-bot-presence-gate.yml`. Other yanniedog repos do not use this gate.

## Operator: install Codex GitHub App

On each gated repo: **Settings → Integrations → GitHub Apps → ChatGPT Codex Connector** → Configure → grant access.

Without the app, `bot-presence-gate` waits until timeout for `chatgpt-codex-connector[bot]`. The `pr-request-bot-reviews` workflow posts `@codex review` automatically but Codex must still be installed.

## AR-local patch

Full operator instructions: [`docs/cross-repo-patches/AR-local/README.md`](cross-repo-patches/AR-local/README.md).

Minimal workflow change:

```diff
-          AR_BOT_WAIT_REQUIRED: gemini
+          AR_BOT_WAIT_REQUIRED: gemini,codex,sourcery
```

Branch: `cursor/codex-required-bots-a216`
