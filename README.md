# SimJury — The Daily Docket

SimJury is **The Daily Docket**: one fictional, contemporary case per day with a
deterministic interactive jury room, playable at
[simjury.com/today](https://simjury.com/today/).

Owner decision, 2026-07-29: the former Android/JVM app and real historical-case
track were removed from this repository and must not be reintroduced. The Daily
Docket remains active. Old `/play` and `/install` URLs redirect to the current web
product.

**Public site:** [simjury.com](https://simjury.com) (Cloudflare Static Assets
project `simjury-web` in `site/`).

## Static hosting and privacy boundary

Case JSON, media, art, and application code are authored in this repository and
bundled by GitHub Actions. Player progress remains in browser storage.
Pre-generated narration is served from GitHub Releases with device-local Web
Speech as a fallback. The Cloudflare deployment is assets-only: no Worker script,
Workers AI, D1, KV, R2, Durable Objects, Queues, Analytics Engine, public
`workers.dev` host, preview URLs, or observability.

Natural narration requests deterministic opaque clip IDs from GitHub. GitHub can
observe normal request metadata and playback timing, but URLs contain no case text,
verdict, or private player state. Cloudflare never synthesizes or stores narration.

## Quick start

```bash
cd site/app
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run validate:cases
npm run build
```

Verify the site wrapper from the repository root with `npm run site:check`.
Use Node 24 and `npm run cloud:bootstrap -- --check` for checkout preflight.

## Repository map

| Area | Location |
|------|----------|
| Owner decision record | `DAILY-PIVOT.md` |
| Daily case authoring | `docs/DAILY-CASES.md` |
| Daily web app | `site/app/` |
| Static site and deployment | `site/` |
| Retired fictional docket provenance | `archive/daily-v1/` |
| PR workflow | `WORKFLOW.md` |

## Development workflow

1. Branch from `main` using `codex/<descriptive-name>`.
2. Open a small PR with one concern.
3. Run the checks documented in `CLAUDE.md`.
4. Resolve CI and all review threads; squash merge only.

`main` requires `validate`, `bot-presence-gate`, and `bot-feedback-gate`. See
`.github/BRANCH_PROTECTION.md` and `WORKFLOW.md`.
