# site/app — The Daily Docket player

The daily-case web app for simjury.com. Imported verbatim from the (now retired)
`simjury-daily` repo at commit `e931d90` per [`DAILY-PIVOT.md`](../../DAILY-PIVOT.md)
(owner decision, 2026-07-13); it evolves here through the D2–D8 ladder into the
8–10 minute daily loop with the interactive jury room.

**The one rule that governs everything:** every daily case is fiction, built from real
trial *patterns*, and says so — the `label: "fiction"` pin in
[`src/lib/caseSchema.ts`](src/lib/caseSchema.ts) is a safety invariant, never a
formality. No real names of people, companies, brands, or places in player-visible
text. Real historical cases ship only through the pilot harness (`CASE_HARNESS.md`),
never through this pipeline.

## Develop

```sh
npm ci
npm run dev             # local dev server
npm run lint            # eslint
npm run typecheck       # tsc --noEmit
npm test                # vitest
npm run validate:cases  # schema + design-quality gate over cases/
npm run build           # typecheck + production build to dist/
```

Node ≥ 20. CI: `.github/workflows/site-app-ci.yml`.

The current `cases/` queue (`d-0001…d-0005`) is the imported v1 seed content used by
tests; it is superseded by the 2026 docket (`dd-*`, schema v2) as the ladder lands.
The full v1 Victorian docket is archived at [`archive/daily-v1/`](../../archive/daily-v1/).

Deployment is wired through `site/`: the app builds into `site/public/today/`, and
`.github/workflows/site.yml` deploys those static assets with the Cloudflare Worker.
The standalone `site-app-ci.yml` workflow remains the fast app-specific quality gate.
