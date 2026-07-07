# Branch Protection for `main`

SimJury uses the **jcs2-mod / AR-local bot gate template**: dynamic bot presence + thread closure gates (not a fixed sleep).

Configure in GitHub **Settings → Rules → Rulesets** (preferred) or **Branches → Branch protection rules**.

## Required settings

| Setting | Value |
|---------|-------|
| Branch name pattern | `main` |
| Require a pull request before merging | Yes |
| Require approvals | 0 for solo operator (PR still required) |
| Require status checks to pass | Yes |
| Required checks | `validate`, `bot-presence-gate`, `bot-feedback-gate` |
| Require conversation resolution before merging | Yes |
| Do not allow bypassing | **Required** |
| Allow squash merging | Yes (only) |

## CI gates

| Workflow / job | Check name | Purpose |
|----------------|------------|---------|
| `ci` | **validate** | Docs, projectmem, pilot tests |
| `pr-bot-presence-gate` | **bot-presence-gate** | Required bots (gemini, sourcery) posted since anchor |
| `pr-bot-feedback-check` | **bot-feedback-gate** | Review threads resolved |

All three must pass. **Do not merge until `bot-presence-gate` and `bot-feedback-gate` are green.**

## Operator setup (one-time)

```bash
npm run github:bot-gates:operator
npm run repo-merge-settings:apply
npm run branch-protection:apply
```

Or import `.github/rulesets/main-bot-gates.json` via GitHub UI.

See also `WORKFLOW.md` and `.github/MERGE_POLICY.md`.

## Agent responsibility

1. Never `git push origin main`
2. Open PR from `cursor/*` branches
3. Fix CI failures in the same branch
4. Run `npm run wait-for-bots -- --watch --pr <n>` until exit 0
5. Fix bot feedback; resolve all review threads
6. Run `npm run pr:gates:check -- --pr <n>` — must exit 0
7. Run `.github/scripts/assert-pr-mergeable.sh <n>`
8. Squash merge: `gh pr merge <n> --auto --squash --delete-branch`

**Agents must never wait for the user to ask before addressing bot feedback.**
