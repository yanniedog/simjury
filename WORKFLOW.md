# SimJury PR workflow

Human workflows: **PR → CI + bot QA gates → squash merge**.

Agent contract: **act or park — never poll.** See [Act or park](#act-or-park--never-poll).

## 1. Open a PR

Push a `cursor/*` branch and open a PR to `main`.

No mutable title or author-name exemption bypasses protected bot gates.

## 2. PR CI (`validate`)

The `ci` workflow runs repository-policy and PR gate script checks. Daily Docket
application checks run in the site workflows.

## 3. Bot presence gate (`bot-presence-gate`)

Merge protection requires CodeRabbit's canonical `Review completed` status on the
**current head SHA**, plus one peer bot since the current PR event anchor.

Default required slots: **`sourcery|codex|cursor,coderabbit`**

| Slot | Meaning |
|------|---------|
| `sourcery\|codex\|cursor` | At least one peer review bot |
| `coderabbit` | **Mandatory** — CodeRabbit cannot be skipped via OR |

| Key | GitHub logins | Notes |
|-----|---------------|-------|
| sourcery | `sourcery-ai[bot]` | Skips some docs/setup PRs |
| codex | `chatgpt-codex-connector[bot]` | Needs ChatGPT Codex Connector app |
| cursor | `cursor`, `cursor[bot]` | Cursor Automation reviews |
| coderabbit | `coderabbitai[bot]` | Required — see [`docs/CODERABBIT.md`](docs/CODERABBIT.md) |
| gemini | `gemini-code-assist[bot]`, … | **Optional** — consumer Code Assist is sunset (noise) |

Comma = ALL-of slots. `|` = OR within a slot. Example: `sourcery|cursor,coderabbit` needs (Sourcery or Cursor) **and** CodeRabbit.

`bot-presence-gate` runs trusted base-branch policy, requests one full CodeRabbit
review per ready head, waits through the vendor's stated quota window, and retries
serially. Walkthroughs, command acknowledgements, stale reviews, `Review rate limited`,
and `Review skipped` never pass. The separate request workflow nudges Codex only.

Local single-shot check (agents):

```sh
npm run wait-for-bots -- --pr <n>          # exit 0 ready | 2 waiting | 1 error
npm run pr:arm-and-park -- --pr <n>      # preferred — arms auto-merge + classifies
```

**Do not** run `wait-for-bots --watch` inside an agent session. CI may poll; agents park.

Env: `SIMJURY_BOT_WAIT_REQUIRED=sourcery|codex|cursor,coderabbit` (fallback: `JCS2_BOT_WAIT_REQUIRED`, `AR_BOT_WAIT_REQUIRED`, `BOT_WAIT_REQUIRED`).

## 4. Bot feedback gate (`bot-feedback-gate`)

All substantive review threads must be **resolved** on GitHub before squash merge.
Branch protection on `main` requires this check; auto-merge will not land while it is red.

```sh
npm run pr:bot-feedback-check -- --pr <n>
```

## 4b. Close guard (`pr-bot-close-guard`)

Closing a PR without merging while required bots are still outstanding (or threads are
unresolved) is blocked: the workflow reopens the PR and comments. Manual check:

```sh
npm run pr:bot-close-guard -- --pr <n> [--reopen]
```

## 4c. Local LLM gate (`local-llm-review`)

A private Windows runner reviews the inert GitHub patch with pinned
`qwen2.5-coder:7b`. It never checks out or executes PR code. Blocker/major
findings, malformed or truncated patches, model mismatch, timeout, fork PRs, and
an offline runner all fail closed. The laptop must be awake and Ollama running.

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
2. Enable squash auto-merge (`gh pr merge --auto --squash --delete-branch`)
3. Classify merge gates as ready / waiting / actionable

Aggregate single-shot audit (no watch in agents):

```sh
npm run pr:gates:check -- --pr <n>
```

`--watch` exists for **humans / CI only** — not for Cursor agents.

## 6. Merge

When gates are green, auto-merge (armed by `pr:arm-and-park`) lands the squash. Manual:

```sh
gh pr merge <n> --auto --squash --delete-branch
# or: npm run pr:merge -- --pr <n>
```

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
| `npm run wait-for-bots` | Single-shot bot presence (CI may `--watch`; agents must not) |
| `npm run pr:bot-feedback-check` | Thread closure gate |
| `npm run pr:bot-close-guard` | Block/reopen premature PR close |
| `npm run pr:coderabbit-contract` | Require/retry canonical CodeRabbit completion on the exact head SHA |
| `npm run pr:request-coderabbit-review` | Manual diagnostic nudge only |
| `npm run pr:coderabbit-ensure-review` | Manual single-open-PR legacy diagnostic only |
| `npm run pr:gates:check` | All merge gates (single shot) |
| `npm run pr:merge` | Enable squash auto-merge |
| `npm run branch-protection:apply` | Apply legacy branch protection |
| `npm run repo-merge-settings:apply` | Squash-only repo settings |
| `npm run github:bot-gates:operator` | Setup helper + local verify |

## Cross-repo sync

Canonical agent rules for all projects live in [cursor-global-workflow](https://github.com/yanniedog/cursor-global-workflow). Portable patches for this efficiency protocol: [`docs/cross-repo-patches/cursor-global-workflow/`](docs/cross-repo-patches/cursor-global-workflow/README.md).
