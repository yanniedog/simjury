# Merge policy (SimJury)

All PRs to `main` use **squash merge** (auto-merge when enabled).

## Merge command

Preferred (agents):

```sh
npm run pr:arm-and-park -- --pr <n>
```

Exit **0** = gates green + auto-merge armed. Exit **2** = parked waiting (OK to end turn). Exit **3** = actionable work remains.

Manual after gates green:

```sh
gh pr merge <n> --auto --squash --delete-branch
```

Do not merge on CI green alone — complete bot wait and thread resolution per `WORKFLOW.md`.
Do not run agent `--watch` loops; GitHub Actions + auto-merge own the wait.

## Repository settings (squash-only)

Apply via API (admin token):

```sh
npm run repo-merge-settings:apply
```

| Setting | Value |
|---------|-------|
| `allow_squash_merge` | true |
| `allow_merge_commit` | false |
| `allow_rebase_merge` | false |
| `delete_branch_on_merge` | true |
| `allow_auto_merge` | true |

## Branch protection / ruleset

Required checks on `main`:

- `validate` — authority docs and PR-gate tooling
- `bot-presence-gate` — `sourcery|codex|cursor` (OR-group) posted since wait anchor
- `bot-feedback-gate` — review threads resolved

Enable via:

```sh
npm run github:bot-gates:operator
npm run repo-merge-settings:apply
npm run branch-protection:apply
```

Or import [`.github/rulesets/main-bot-gates.json`](rulesets/main-bot-gates.json) in GitHub Settings → Rules → Rulesets.
