# CLAUDE.md

## Start here

The repository's only product surface is **The Daily Docket** on
**simjury.com**, implemented in `site/app/`.

1. Read [`DAILY-PIVOT.md`](DAILY-PIVOT.md), the owner decision record and product
   constraints.
2. Read [`docs/DAILY-CASES.md`](docs/DAILY-CASES.md) for case-authoring rules,
   and [`docs/DOCKET-SUPPLY.md`](docs/DOCKET-SUPPLY.md) for how the docket stays
   a fortnight ahead and what "complete" means for a case.
3. Use [`ROADMAP.md`](ROADMAP.md), [`WORKFLOW.md`](WORKFLOW.md), and
   [`site/DECISIONS.md`](site/DECISIONS.md) as needed.

On 2026-07-29 the owner removed the former Android/JVM app and real historical-case
track. They must not be reintroduced. Old `/play` and `/install` URLs are tombstoned
to the current web product.

## Non-negotiable rules

- **Daily Docket only** — work in `site/app/` and its site, CI, content, and docs.
- **Daily cases are fiction, and say so** — `label: "fiction"` is a safety
  invariant. Cases use real trial patterns, never real events, and contain no real
  names of people, companies, brands, or specific places in player-visible text.
- **No runtime AI; static-first hosting** — player-facing text is pre-authored JSON.
  Ordinary and solo routes remain static; only the allowlisted live-jury paths
  may use the bounded Worker and SQLite Durable Objects.
- **A 20-minute V4 sitting** — new V4 cases must validate inside a computed
  19–21 minute window. The playable V3 slate keeps its existing pacing gates
  only until each case is expanded under the transitional 20-minute gate or
  fully migrated; do not weaken either contract.
- **Preserve provenance** — `archive/daily-v1/` is retained verbatim and is not a
  shipped case source.
- **PRs target the default branch, and run in parallel** — never stack a PR onto a
  feature branch (it merges unreviewed) and never hand-roll `gh pr merge --auto`;
  `pr:arm-and-park` fails closed with `base-unprotected`. Many PRs may be open
  against `main` at once. See `.cursor/rules/pr-base-must-be-gated.mdc`.
- **Required checks stay deterministic** — only `validate` and
  `bot-feedback-gate` block merge. External bot presence and local Qwen are
  advisory/disabled; every substantive review thread still needs a disposition.
- **One concern per PR, about 400 lines, squash merge.** Agents use
  `npm run pr:arm-and-park`; never `--watch` babysitting.

## Build and test

```powershell
cd site/app
npm ci
npm run lint
npm run typecheck
npm test
npm run validate:cases
npm run build
```
