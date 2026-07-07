# AR-local: Codex required-bot alignment

Apply on `yanniedog/AR-local` (cursor[bot] cannot push to this repo).

## Files to copy

1. `.github/workflows/pr-bot-presence-gate.yml` — set `AR_BOT_WAIT_REQUIRED: gemini,codex,sourcery` (see `pr-bot-presence-gate.yml.patched` in this folder).
2. `.github/workflows/pr-request-bot-reviews.yml` — copy from this folder.
3. `scripts/request-codex-review.mjs` — copy from this folder.
4. `docs/HANDOFF.md` — update required-bots bullet to gemini + codex + sourcery.
5. `package.json` — add `"pr:request-codex-review": "node scripts/request-codex-review.mjs"` if missing.

## One-shot apply (operator)

```sh
git clone https://github.com/yanniedog/AR-local.git
cd AR-local
git checkout -b cursor/codex-required-bots-a216

# Workflow env
sed -i 's/AR_BOT_WAIT_REQUIRED: gemini/AR_BOT_WAIT_REQUIRED: gemini,codex,sourcery/' .github/workflows/pr-bot-presence-gate.yml

# Auto @codex review (copy from simjury PR #15)
cp /path/to/simjury/.github/workflows/pr-request-bot-reviews.yml .github/workflows/
cp /path/to/simjury/scripts/request-codex-review.mjs scripts/

git add -A
git commit -m "ci: require Codex on bot-presence-gate (gemini,codex,sourcery)"
git push -u origin cursor/codex-required-bots-a216
gh pr create --draft --title "ci: require Codex on bot-presence-gate (gemini,codex,sourcery)"
```

## Codex GitHub App

Settings → Integrations → GitHub Apps → **ChatGPT Codex Connector** → grant access to AR-local.
