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
| `ci` | **validate** | Authority docs and PR-gate tooling |
| `pr-bot-presence-gate` | **bot-presence-gate** | Peer bot (`sourcery\|codex\|cursor`) **and** mandatory CodeRabbit since anchor + quiet window |
| `pr-bot-feedback-check` | **bot-feedback-gate** | Review threads resolved |
| `pr-bot-close-guard` | (side-effect) | Reopens PRs closed with outstanding bot obligations |

All three required checks must pass. **Do not squash-merge until `bot-presence-gate` and `bot-feedback-gate` are green.**

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
4. Run `npm run pr:arm-and-park -- --pr <n>` (single shot) — **never** `--watch` in agents
5. On exit 2 (parked): end turn; on exit 3: fix bots/threads/CI, push, re-arm
6. Squash auto-merge is armed by arm-and-park; do not babysit-poll until merge

**Agents must never wait for the user to ask before addressing bot feedback.**
**Agents must never sleep-poll bot gates** — use `pr:arm-and-park`.
