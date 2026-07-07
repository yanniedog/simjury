# Branch Protection for `main`

SimJury requires PR gates on `main`. Configure in GitHub **Settings → Branches → Branch protection rules**.

## Required settings

| Setting | Value |
|---------|-------|
| Branch name pattern | `main` |
| Require a pull request before merging | Yes |
| Require approvals | 1 for teams; **uncheck entirely** for solo operator (PR still required) |
| Dismiss stale reviews | Yes |
| Require status checks to pass | Yes |
| Required checks | `validate` **and** `bot-review-window` (from `ci.yml`) |
| Require conversation resolution before merging | Yes |
| Do not allow bypassing | **Required** — prevents agents merging before bot window |
| Restrict pushes | No direct pushes to `main` |
| Allow squash merging | Yes (preferred) |
| Allow merge commits | No |
| Allow rebase merging | Optional |

## CI gates

The `ci` workflow runs on every pull request:

| Job | Purpose |
|-----|---------|
| **validate** | Docs, projectmem, pilot tests |
| **bot-review-window** | **8-minute mandatory wait** so review bots (Sourcery, etc.) can post before merge |

Both jobs must pass. **Do not merge until `bot-review-window` is green** — merging early bypasses bot feedback.

## Operator setup (one-time)

If you have admin access, apply protection from the repo:

```bash
chmod +x .github/scripts/apply-branch-protection.sh
./.github/scripts/apply-branch-protection.sh yanniedog simjury main
```

Or configure manually in GitHub Settings → Branches → `main` → add both required checks.

Verify both checks appear under "Require status checks to pass before merging".

## Agent responsibility

Cloud agents and local agents must:

1. Never `git push origin main`
2. Open PR from `cursor/*-fb69` branches (or documented suffix)
3. Fix CI failures in the same branch
4. **Wait for `bot-review-window` to pass** (minimum 8 minutes after last push)
5. Read all bot review comments; **fix every valid item in code**; reply; resolve threads
6. Run `.github/scripts/audit-bot-feedback.sh <pr-number>` — must exit 0
7. Run preflight before merge: `.github/scripts/assert-pr-mergeable.sh <pr-number>`
8. Resolve any remaining threads: `.github/scripts/resolve-bot-threads.sh <pr-number>`
9. Squash merge **only** when validate + bot-review-window pass and conversations resolved

**Agents must never wait for the user to ask before addressing bot feedback.**

## Operator checklist

- [ ] Branch protection rule applied to `main`
- [ ] `validate` check required
- [ ] **`bot-review-window` check required**
- [ ] "Require conversation resolution" enabled
- [ ] "Do not allow bypassing" enabled (blocks admin/agent early merge)
- [ ] Direct push to `main` disabled for bots/agents
