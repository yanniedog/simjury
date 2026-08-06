# SimJury — Court Week

SimJury is one immersive fictional criminal trial, **Eleven Minutes**, unfolding
over a five-day court week and a weekend jury deliberation. The canonical player
is [simjury.com](https://simjury.com/).

The experience is audio-first and fullscreen, with optional captions and reading
mode. It is designed as the same complete legal experience on phones, tablets
and desktop browsers. Eleven authored jurors deliberate locally with the player;
there are no accounts, human-room services or runtime AI.

Owner decisions retained: the former Android/JVM application, real
historical-case track and Daily Docket are retired and must not be reintroduced.
Legacy `/today`, `/play` and `/install` routes redirect to Court Week.

## Static hosting and privacy boundary

Reviewed source and production automation live in GitHub. Trusted manual GitHub
Actions generate and verify media; heavy, content-addressed assets are pinned to
an immutable GitHub Release. Cloudflare serves Static Assets only and performs no
application compute or storage.

Progress, private notes and ballots stay in browser storage. An explicit local
export/import file provides device transfer. GitHub can observe ordinary media
request metadata and Cloudflare can observe ordinary CDN request metadata; those
requests contain no saved progress, private notes or ballots.

## Quick start

```bash
cd site/app
npm ci
npm run lint
npm run typecheck
npm test
npm run validate:cases
npm run build

cd ..
npm ci
npm run check
```

Use Node 24. The root preflight is `npm run cloud:bootstrap -- --check`.

## Repository map

| Area | Location |
|------|----------|
| Active owner decision | `COURT-WEEK.md` |
| Interface contract | `docs/DESIGN-PROTOCOL.md` |
| Court Week web app | `site/app/` |
| Static deployment | `site/` |
| Retired Daily Docket | `archive/daily-v2-2026-08-03/` |
| Earlier fictional provenance | `archive/daily-v1/` |
| PR workflow | `WORKFLOW.md` |

## Development workflow

Branch from `main`, open a small draft PR with one concern, run the checks in
`CLAUDE.md`, and resolve CI and every substantive review thread. `main` requires
`validate` and `bot-feedback-gate`; squash merging is armed only through
`npm run pr:arm-and-park`.
