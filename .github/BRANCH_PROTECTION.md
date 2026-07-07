# Branch Protection for `main`

SimJury requires PR gates on `main`. Configure in GitHub **Settings → Branches → Branch protection rules**.

## Required settings

| Setting | Value |
|---------|-------|
| Branch name pattern | `main` |
| Require a pull request before merging | Yes |
| Required approvals | 1 (or 0 for solo operator — still require PR) |
| Dismiss stale reviews | Yes |
| Require status checks to pass | Yes |
| Required checks | `validate` (from `ci.yml`) |
| Require conversation resolution before merging | Yes |
| Do not allow bypassing | Recommended |
| Restrict pushes | No direct pushes to `main` |
| Allow squash merging | Yes (preferred) |
| Allow merge commits | No |
| Allow rebase merging | Optional |

## CI gate

The `ci` workflow runs:

1. **validate** — docs, projectmem, pilot tests (when `pilot/` exists)
2. Fails on any error — PR cannot merge until green

## Agent responsibility

Cloud agents and local agents must:

1. Never `git push origin main`
2. Open PR from `cursor/*-61f6` branches
3. Fix CI failures in the same branch
4. Re-request review after pushes
5. Squash merge only when all checks and conversations are resolved

## Operator checklist

- [ ] Branch protection rule applied to `main`
- [ ] `validate` check required
- [ ] "Require conversation resolution" enabled
- [ ] Direct push to `main` disabled for bots/agents
