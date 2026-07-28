# Project Map - simjury

Status: current as of 2026-07-29

## Project purpose

SimJury is The Daily Docket on simjury.com: fictional, contemporary cases played
end-to-end with a deterministic interactive jury room. The web product in `site/app/`
is the repository's only application.

The former Android/JVM application and real historical-case track were removed by
owner decision on 2026-07-29 and must not be reintroduced. Compatibility redirects
send old `/play` links to `/today/` and old `/install` links to `/`.

## Main folders

- `site/app/` - Vite/TypeScript Daily Docket application, case data, media, tests,
  and deterministic deliberation engine.
- `site/` - Cloudflare Static Assets wrapper, landing pages, deployment checks, and
  narration publishing scripts.
- `docs/` - Daily case authoring and repository workflow documentation.
- `archive/daily-v1/` - retained provenance for the superseded daily prototype.
- `.github/` - CI, static deployment, narration, and PR bot-gate workflows.
- `.projectmem/` - local project history and this current topology summary.

## Entry points

- `DAILY-PIVOT.md` - binding product decision record.
- `CLAUDE.md` and `AGENTS.md` - session and delivery rules.
- `docs/DAILY-CASES.md` - fictional case authoring contract.
- `site/app/src/lib/v2/caseSchema.ts` - current case schema.
- `site/app/src/engine/` - deterministic jury-room engine.
- `WORKFLOW.md` - PR review and merge gates.

## Build and verification

Run the Daily Docket checks from `site/app/`: lint, typecheck, tests,
`validate:cases`, and build. Run `npm run site:check` from the repository root for
the static-hosting guard, landing/crawl validation, application build, and Wrangler
dry run.

Daily cases are always fictional and pre-authored. The deployment is static-only,
has no runtime AI, and stores player state in the browser.
