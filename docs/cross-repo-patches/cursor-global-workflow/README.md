# Cross-repo: act-or-park PR efficiency

`cursor[bot]` cannot push to `cursor-global-workflow`, `jcs2-mod`, or `AR-local` from SimJury cloud agents. Apply this pack on each repo (or merge from a fork) so agents stop babysitting PRs with `--watch` / sleep polls.

## Problem

Agents burned tokens on:

- `npm run wait-for-bots -- --watch`
- `npm run pr:gates:check -- --watch`
- `gh pr checks --watch`
- Orchestrator/chief spawning dedicated babysit workers that only poll

GitHub Actions already re-fire bot gates; squash auto-merge already lands when green. Agents should **act or park**, not poll.

## Contract

| Exit of `pr:arm-and-park` | Meaning |
|---------------------------|---------|
| 0 | Gates green; auto-merge armed |
| 2 | Waiting on bots/CI only — keep ownership via self-wake (no handoff) |
| 3 | Actionable — fix CI / threads / conflicts |
| 1 | Hard error |

**Forbidden in agent sessions:** any `--watch` bot/CI loop.

## Apply to cursor-global-workflow

```sh
git clone https://github.com/yanniedog/cursor-global-workflow.git
cd cursor-global-workflow
git checkout -b cursor/pr-arm-and-park-efficiency

# From SimJury checkout:
SJ=/path/to/SimJury
SRC=$SJ/docs/cross-repo-patches/cursor-global-workflow

# Scripts (canonical live copies in SimJury scripts/)
cp "$SJ/scripts/pr-arm-and-park.mjs" scripts/
cp "$SJ/scripts/verify-pr-arm-and-park.mjs" scripts/
cp "$SJ/scripts/lib/pr-arm-and-park-lib.mjs" scripts/lib/
cp "$SJ/scripts/lib/pr-branch-sync.mjs" scripts/lib/
cp "$SJ/scripts/lib/pr-merge.mjs" scripts/lib/

# Rules / skills / template from this pack
cp "$SRC/rules/no-agent-watch-loops.mdc" rules/
cp "$SRC/rules/no-early-stop-after-pr.mdc" rules/
cp "$SRC/skills/pr-fix-agent/SKILL.md" skills/pr-fix-agent/
cp "$SRC/skills/workflow-orchestrator/SKILL.md" skills/workflow-orchestrator/
cp "$SRC/skills/chief-agent/SKILL.md" skills/chief-agent/
cp "$SRC/templates/WORKFLOW.md" templates/WORKFLOW.md
# Also merge act-or-park into root WORKFLOW.md / AGENTS.md

# package.json — add:
#   "pr:arm-and-park": "node scripts/pr-arm-and-park.mjs"
#   "pr:arm-and-park:verify": "node scripts/verify-pr-arm-and-park.mjs"
# scripts/lib/repo-bootstrap.mjs NPM_STUBS — add pr:arm-and-park

echo 5 > bootstrap-version.txt

git add -A
git commit -m "ci: act-or-park PR protocol (no agent watch loops)"
git push -u origin HEAD
gh pr create --draft --title "ci: act-or-park PR protocol (no agent watch loops)"
```

Then run `./install.sh` (or `install.ps1`) so `~/.cursor/skills` and `~/.cursor/workflow-scripts` pick up the change for **all** local repos.

## Apply to jcs2-mod / AR-local

1. Copy `scripts/pr-arm-and-park.mjs` + `scripts/lib/pr-arm-and-park-lib.mjs` (and `pr-branch-sync.mjs` / `pr-merge.mjs` if missing).
2. Add npm script `pr:arm-and-park`.
3. Replace agent babysit instructions in `AGENTS.md` / `WORKFLOW.md` / `HANDOFF.md` with the act-or-park table above.
4. Keep CI `bot-presence-gate` event-driven (SimJury style single-shot retries). Prefer **not** `wait-for-bots --watch` inside Actions either if the workflow already re-fires on review/comment events.

## Simjury status

Landed in-tree on SimJury (`npm run pr:arm-and-park`). This folder is the portable mirror for the other three repos listed in `docs/CROSS_REPO_BOT_MATRIX.md`.
