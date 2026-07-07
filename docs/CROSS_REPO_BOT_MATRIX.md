# Cross-repo bot matrix alignment

Required bots on human work PRs (presence gate): **gemini**, **codex**, **sourcery**.

| Repository | `*_BOT_WAIT_REQUIRED` | Status |
|------------|------------------------|--------|
| [cursor-global-workflow](https://github.com/yanniedog/cursor-global-workflow) | `gemini,codex,sourcery` (template) | OK |
| [jcs2-mod](https://github.com/yanniedog/jcs2-mod) | `JCS2_BOT_WAIT_REQUIRED=gemini,codex,sourcery` | OK |
| [simjury](https://github.com/yanniedog/simjury) | `SIMJURY_BOT_WAIT_REQUIRED=gemini,codex,sourcery` | PR #15 |
| [AR-local](https://github.com/yanniedog/AR-local) | was `gemini` only | **Apply patch below** |

## Operator: install Codex GitHub App

On each repo: **Settings → Integrations → GitHub Apps → ChatGPT Codex Connector** → Configure → grant access to the repository.

Without the app installed, `bot-presence-gate` will wait until timeout for `chatgpt-codex-connector[bot]`.

## AR-local patch (apply on `main`)

```diff
--- a/.github/workflows/pr-bot-presence-gate.yml
+++ b/.github/workflows/pr-bot-presence-gate.yml
@@ -80,10 +80,7 @@
         env:
           GH_TOKEN: ${{ secrets.BOT_GATE_TOKEN || github.token }}
           GITHUB_REPOSITORY: ${{ github.repository }}
-          # gemini is the required reviewer. sourcery was dropped 2026-06-09 because it
-          # stalled (free-tier review quota / outage) and blocked merges; re-add it here
-          # (AR_BOT_WAIT_REQUIRED: gemini,sourcery) once it's reliably reviewing again.
-          AR_BOT_WAIT_REQUIRED: gemini
+          AR_BOT_WAIT_REQUIRED: gemini,codex,sourcery
```

Update `docs/HANDOFF.md` §6 required-bots bullet to match.

Branch: `cursor/codex-required-bots-a216`
