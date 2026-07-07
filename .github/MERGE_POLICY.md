# Merge policy (SimJury)

All PRs to `main` use **squash merge** (auto-merge when enabled).

## Merge command

After `npm run pr:gates:check -- --pr <n>` exits **0**:

```sh
gh pr merge <n> --auto --squash --delete-branch
```

Do not merge on CI green alone — complete bot wait and thread resolution per `WORKFLOW.md`.

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

- `validate` — docs, projectmem, pilot tests (+ Android when present)
- `bot-presence-gate` — gemini, sourcery posted since wait anchor
- `bot-feedback-gate` — review threads resolved

Enable via:

```sh
npm run github:bot-gates:operator
npm run repo-merge-settings:apply
npm run branch-protection:apply
```

Or import [`.github/rulesets/main-bot-gates.json`](rulesets/main-bot-gates.json) in GitHub Settings → Rules → Rulesets.
