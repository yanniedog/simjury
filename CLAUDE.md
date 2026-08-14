# CLAUDE.md

## Start here

The repository's only product is **SimJury Court Week** on simjury.com,
implemented in `site/app/` and governed by [`COURT-WEEK.md`](COURT-WEEK.md).

1. Read `COURT-WEEK.md` for the owner decision and legal/hosting invariants.
2. Read `docs/DESIGN-PROTOCOL.md` before changing the interface.
3. Use `ROADMAP.md`, `WORKFLOW.md`, and `site/DECISIONS.md` as needed.
4. Treat `DAILY-PIVOT.md`, `docs/DAILY-CASES.md`,
   `docs/DOCKET-SUPPLY.md`, and `docs/COMMISSION-BRIEF.md` as retired-history
   pointers, not active specifications.

On 2026-07-29 the owner removed the Android/JVM application and real
historical-case track. On 2026-08-03 the owner retired the Daily Docket, its
rolling supply, live rooms and waitlist. None may be reintroduced.

## Non-negotiable rules

- **One Court Week case only:** Eleven Minutes, with five court days and weekend
  deliberation. No case chooser or rolling docket.
- **Fiction and adult-entry safety:** no real people, organisations, brands,
  events or specific real places; serious, non-graphic writing; one combined
  fiction/18+ entry gate.
- **No runtime AI or backend play:** content is reviewed and pre-authored;
  progress, notes and ballots stay on-device.
- **Cloudflare Static Assets only:** no Worker, route, D1, Durable Object, KV,
  R2, Queue, AI, rate limiter, variables or observability.
- **Audio-first, device-complete:** each session lasts only as long as its
  reviewed dialogue and meaningful juror decisions require, with minimal
  persistent text, optional captions and reading mode, and equivalent play on
  supported phone, tablet and desktop browsers.
- **Preserve provenance:** both `archive/daily-v1/` and
  `archive/daily-v2-2026-08-03/` are retained and excluded from builds.
- **PR discipline:** target `main`; required deterministic `validate` and
  `bot-feedback-gate`; one concern per PR; squash through `pr:arm-and-park`.

## Build and test

```powershell
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
