# Branch Protection for `main`

SimJury uses the AR-app liveness profile: deterministic CI plus substantive
review-thread resolution. Reviewer presence and local model availability do not
block merge.

Configure in GitHub **Settings → Rules → Rulesets** (preferred) or **Branches → Branch protection rules**.

## Required settings

| Setting | Value |
|---------|-------|
| Branch name pattern | `main` |
| Require a pull request before merging | Yes |
| Require approvals | 0 for solo operator (PR still required) |
| Require status checks to pass | Yes |
| Required checks | `validate`, `bot-feedback-gate` |
| Require conversation resolution before merging | Yes |
| Do not allow bypassing | **Required** |
| Allow squash merging | Yes (only) |

## CI gates

| Workflow / job | Check name | Purpose |
|----------------|------------|---------|
| `ci` | **validate** | Authority docs and PR-gate tooling |
| `pr-bot-feedback-check` | **bot-feedback-gate** | Review threads resolved |
| `pr-bot-close-guard` | (side-effect) | Reopens PRs closed with unresolved feedback |

These are the only required checks. CodeRabbit, Codex, Cursor, Sourcery,
Gemini, and local Qwen output remain advisory, but every substantive finding
still needs a reply and resolution. Automatic Qwen and bot-presence workflows
are disabled.

The feedback workflow allows one active loop per PR. A new head cancels the
obsolete head's loop and starts the required check for the current revision;
the concurrency group must not include the head SHA or a queue cap.

## Operator setup (one-time)

```bash
npm run github:bot-gates:operator
npm run repo-merge-settings:apply
npm run repo-name:apply
npm run branch-protection:apply -- --check
npm run branch-protection:apply
```

`branch-protection:apply` reconciles the exact required contexts and removes
retired checks. Or import `.github/rulesets/main-bot-gates.json` via GitHub UI.

See also `WORKFLOW.md` and `.github/MERGE_POLICY.md`.

## Agent responsibility

1. Never `git push origin main`
2. Open PR against the exact default branch
3. Fix CI failures in the same branch
4. Run `npm run pr:arm-and-park -- --pr <n>` (single shot) — **never** `--watch` in agents
5. On exit 2, park; on exit 3, fix feedback/CI, push, and re-arm
6. Squash auto-merge is armed by arm-and-park; do not babysit-poll until merge

**Agents must never wait for the user to ask before addressing review feedback.**
**Agents must never sleep-poll gates** — use `pr:arm-and-park`.
