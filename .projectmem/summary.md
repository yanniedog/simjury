# Project Summary - simjury

## Current direction

SimJury's only product is The Daily Docket at `simjury.com/today`: fictional,
contemporary cases with a deterministic client-side jury room. The application is in
`site/app/` and deploys as static assets through `site/`.

Owner decision 2026-07-29 removed the former Android/JVM application, installer,
release automation, real historical case, source corpus, and historical authoring
pipeline. Those tracks must not be reintroduced. Old `/play` and `/install` URLs are
compatibility redirects only.

## Binding decisions

- Daily cases are fictional, pre-authored, banned-token scanned, and contain no real
  people, companies, brands, or specific places in player-visible text.
- Deliberation is deterministic and runs in the browser.
- Hosting is static-only; no runtime AI or backend player-state service.
- Player progress, notes, verdicts, and preferences remain in local browser storage.
- Pull requests require the repository CI and bot presence/feedback gates, with squash
  merge after all review threads are resolved.

## Key files

- `DAILY-PIVOT.md`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/DAILY-CASES.md`
- `site/DECISIONS.md`
- `site/app/`
- `WORKFLOW.md`
