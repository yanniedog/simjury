# site/app — SimJury Court Week

The static React player for **Eleven Minutes**, SimJury's one active fictional
case. The player serves seven sequential sessions at `/`: five court days
followed by Saturday and Sunday deliberation. The binding contract is
[`COURT-WEEK.md`](../../COURT-WEEK.md).

Court Week is audio-first and fullscreen, with optional captions and reading
mode. It must provide the same complete legal record on supported phones,
tablets, split-screen layouts and desktop browsers. Eleven jurors and every
response are authored; progress, private notes and ballots remain on-device.

The Daily Docket source/media are retained only under
[`archive/daily-v2-2026-08-03/`](../../archive/daily-v2-2026-08-03/). The former
Android/JVM and real historical-case tracks remain removed.

## Develop

```sh
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run validate:cases
npm run build
```

Node 24 is the repository standard. CI is
`.github/workflows/site.yml`. Production output is
`site/public/jury/` and is proxied statically to `/`; the `site/` wrapper enforces an assets-only Cloudflare
configuration and deploys only after protected `main` checks pass.
