# SimJury PR workflow

Human workflows: **PR → CI + bot QA gates → squash merge**.

Agent contract: **act or park — never poll.** See [Act or park](#act-or-park--never-poll).

## 0. PRs target the default branch, and run in parallel (rigid)

Required status checks attach to a **branch**, not to a pull request. A PR based
on a feature branch is therefore armed and **merged within seconds, unreviewed** —
how PR #264 landed on 2026-07-30 and doubled the scope of #263 beneath it.

**This cannot be fixed with a ruleset.** A branch ruleset that gates merges into a
ref also gates pushes to it: `required_status_checks` rejects a push with
`GH013: 4 of 4 required status checks are expected`, and a `pull_request` rule
requires a PR to update the branch at all. Applying either to `~ALL` locked every
agent out of pushing its own topic branch. It was tried here and reverted. Gating a
feature branch as a base and working on it are mutually exclusive on GitHub.

So the rule lives in the tooling every agent goes through:

```sh
npm run pr:base-guard:verify   # prove the guard fails closed
```

`pr:arm-and-park` and `pr:merge` resolve the PR base and **refuse to arm
auto-merge** unless it is the exact default branch, reporting exit 3 with
`base-unprotected`. Never disable or route around it.

### Many PRs at once — the actual answer to concurrency

Opening one PR at a time never was required, and does not survive several agents
(Cursor, Codex, Claude and their cloud agents) on one repo. Open them **all**
against `main`:

- each is reviewed concurrently by the bots on its own diff;
- each lands as soon as its own gates go green;
- only a genuine dependency chain serialises, and only at *merge* time — its PRs
  are still reviewed in parallel. Keep such a chain as local branches so each link
  stays verifiable, point every PR at `main`, and rebase as each parent lands
  (`arm-and-park` reports "behind base" as actionable).

Agent-facing copies: `.cursor/rules/pr-base-must-be-gated.mdc`, `AGENTS.md`,
`CLAUDE.md`, the global Claude instructions, and
`docs/cross-repo-patches/cursor-global-workflow/`.

## 1. Open a PR

Push a branch and open a PR **against `main`**. Any other base merges unreviewed
and is refused by the base guard (see §0). Several PRs may be open at once.

Draft publication is opt-in. Background progression helpers leave drafts
untouched; only the explicit `pr:arm-and-park` and `pr:merge` commands may mark
a draft ready. If `gh pr ready` fails, the command stops with a diagnostic hard
error and does not continue as though auto-merge were armed.

No mutable title or author-name exemption bypasses protected bot gates.

## 2. PR CI (`validate`)

The `ci` workflow runs repository-policy and PR gate script checks. Daily Docket
application checks run in the site workflows.

## 3. Advisory reviewers

CodeRabbit, Codex, Cursor, Sourcery, Gemini, and local Qwen may review a PR.
Their findings are handled under the feedback policy below, but presence is not
required and vendor, quota, runner, or laptop availability never blocks merge.
Automatic Qwen and bot-presence workflows are disabled.

Optional explicit presence diagnostics still support OR-groups:

| Slot | Meaning |
|------|---------|
| `sourcery\|codex\|cursor` | At least one peer review bot |
| `coderabbit` | A CodeRabbit review |

| Key | GitHub logins |
|-----|---------------|
| sourcery | `sourcery-ai[bot]` |
| codex | `chatgpt-codex-connector[bot]` |
| cursor | `cursor`, `cursor[bot]` |
| coderabbit | `coderabbitai[bot]` |

Comma = ALL-of slots. `|` = OR within a slot. These slots are opt-in
diagnostics, not branch protection.

```sh
npm run wait-for-bots -- --pr <n> --require-bots "sourcery|codex|cursor,coderabbit"
npm run pr:local-llm-review -- --pr <n>
```

Never use `--watch` inside an agent session.

## 4. Bot feedback gate (`bot-feedback-gate`)

All substantive review threads must be **resolved** on GitHub before squash merge.
Branch protection on `main` requires this check; auto-merge will not land while it is red.
Each event runs the audit once with a five-minute cap. A reply, push, or explicit
re-run evaluates it again; the workflow does not occupy a runner in a sleep loop.

```sh
npm run pr:bot-feedback-check -- --pr <n>
```

The gate audit discovers required contexts from live protection/rules and
evaluates the newest observations attached to the exact current PR head.
Missing required contexts are waiting, never an implicit pass.

## 4b. Close guard (`pr-bot-close-guard`)

Closing a PR without merging while substantive threads are unresolved is blocked:
the workflow reopens the PR and comments. Manual check:

```sh
npm run pr:bot-close-guard -- --pr <n> [--reopen]
```

## 4c. Advisory local review

The optional local script reviews an inert GitHub patch with pinned
`qwen3.5:4b`. It is not automatic or required.

## 5. Act or park — never poll

Agents burn tokens when they sleep-poll for bots. Use one command:

```sh
npm run pr:arm-and-park -- --pr <n>
```

| Exit | Meaning | Agent action |
|------|---------|--------------|
| **0** | Gates green; auto-merge armed | Finish remaining ownership (post-merge included) |
| **2** | Waiting on bots/CI only | Keep ownership via self-wake — do not `--watch`, do not hand off to the user |
| **3** | **Actionable** — CI fail / threads / conflicts | Fix, push, re-run arm-and-park |
| **1** | Hard error | Fix auth/tooling |

What arm-and-park does (one shot, no loops):

1. Sync branch when behind (`gh pr update-branch`)
2. Explicitly mark a draft ready when needed, then enable squash auto-merge
   through the exact-default-base guard
3. Classify merge gates as ready / waiting / actionable

Aggregate single-shot audit (no watch in agents):

```sh
npm run pr:gates:check -- --pr <n>
```

`--watch` exists for **humans / CI only** — not for Cursor agents.

## 6. Merge

When gates are green, auto-merge (armed by `pr:arm-and-park`) lands the squash.
Manual: `npm run pr:merge -- --pr <n>`. Do not bypass its base guard with a
bare `gh pr merge` command.

See [`.github/MERGE_POLICY.md`](.github/MERGE_POLICY.md).

## Enable branch protection (one-time)

```sh
npm run github:bot-gates:operator
npm run repo-merge-settings:apply
npm run branch-protection:apply
```

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run pr:arm-and-park` | **Preferred agent entry** — arm auto-merge + classify (no poll) |
| `npm run wait-for-bots` | Optional single-shot reviewer diagnostic; advisory by default |
| `npm run pr:bot-feedback-check` | Thread closure gate |
| `npm run pr:bot-close-guard` | Block/reopen premature PR close |
| `npm run pr:coderabbit-contract` | Optional exact-head CodeRabbit diagnostic |
| `npm run pr:request-coderabbit-review` | Manual diagnostic nudge only |
| `npm run pr:coderabbit-ensure-review` | Manual single-open-PR legacy diagnostic only |
| `npm run pr:gates:check` | All merge gates (single shot) |
| `npm run pr:merge` | Enable squash auto-merge |
| `npm run pr:base-guard:verify` | Prove the base guard fails closed |
| `npm run branch-protection:apply` | Apply legacy branch protection |
| `npm run repo-merge-settings:apply` | Squash-only repo settings |
| `npm run github:bot-gates:operator` | Setup helper + local verify |

## Cross-repo sync

Canonical agent rules for all projects live in [cursor-global-workflow](https://github.com/yanniedog/cursor-global-workflow). Portable patches for this efficiency protocol: [`docs/cross-repo-patches/cursor-global-workflow/`](docs/cross-repo-patches/cursor-global-workflow/README.md).
