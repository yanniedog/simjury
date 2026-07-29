# AR-app: PR bot presence hardening

`cursor[bot]` cannot push to `yanniedog/AR-app` from simjury cloud agents. Apply this pack on AR-app.

## Root cause (AR-app PR #41)

1. **Sourcery-only required** (`AR_BOT_WAIT_REQUIRED: sourcery`) — Sourcery skips some PRs (docs/setup). PR #41 had Cursor Automation review but **no Sourcery**, so `bot-presence-gate` could never pass.
2. **No in-job retries** — gate failed on the first `wait-for-bots` exit 2 (bots still in flight), leaving a sticky red required check.
3. **Gemini sunset noise** — `gemini-code-assist` posts a sunset caution on every PR; not a real review (filter as noise).
4. Agents were instructed to `--watch` babysit (token burn); prefer act-or-park when available.

## Apply

```sh
git clone https://github.com/yanniedog/AR-app.git
cd AR-app
git checkout -b cursor/bot-presence-or-groups

SJ=/path/to/simjury
PACK=$SJ/docs/cross-repo-patches/AR-app

cp "$PACK/pr-bot-presence-gate.yml" .github/workflows/pr-bot-presence-gate.yml
cp "$PACK/bot-wait-config.mjs" scripts/lib/bot-wait-config.mjs
cp "$PACK/bot-noise.mjs" scripts/lib/bot-noise.mjs
cp "$PACK/verify-bot-wait-or-groups.mjs" scripts/verify-bot-wait-or-groups.mjs

# package.json — add:
#   "pr:bot-wait-or-groups:verify": "node scripts/verify-bot-wait-or-groups.mjs"
# Wire into CI if present.

# Optional repo variable override (CodeRabbit remains mandatory):
#   Settings → Variables → AR_BOT_WAIT_REQUIRED = sourcery|cursor,coderabbit

git add -A
git commit -m "ci: merge protection (peer OR + mandatory CodeRabbit)"
git push -u origin HEAD
gh pr create --draft --title "ci: merge protection (peer OR + mandatory CodeRabbit)"
```

Also update `AGENTS.md`: replace `--watch` babysit loops with single-shot `wait-for-bots` / `pr:arm-and-park` when that script is present (see `../cursor-global-workflow/`).

## Verify

```sh
node scripts/verify-bot-wait-or-groups.mjs
# Needs a peer bot AND CodeRabbit:
npm run wait-for-bots -- --pr <n>   # exit 0 only when both slots satisfied + quiet
```
