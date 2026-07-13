# archive/daily-v1 — frozen import from the simjury-daily repo

Provenance snapshot taken 2026-07-13 when the `simjury-daily` repo was absorbed into
this repo per [`DAILY-PIVOT.md`](../../DAILY-PIVOT.md). Contents:

- `cases/` — the full 30-case Victorian-era v1 docket (`d-0001…d-0030`; `d-0006…d-0030`
  were uncommitted work-in-progress in the source repo, preserved here).
- `docs/` — the v1 generation spec (`CASE-GENERATION.md`), the 30-day docket design
  (`CASE-DOCKET-30.md`), and hosting guardrails (`COST-GUARDRAILS.md`).
- `simjury-daily-README.md` / `simjury-daily-ROADMAP.md` — the source repo's own docs.

**Nothing here ships.** The 2026 mandate (`DAILY-PIVOT.md`) supersedes the Victorian
docket; the live pipeline and its active cases live in [`site/app/`](../../site/app/).
These files are kept for design provenance — the trap shapes, verdict-mix rules, and
difficulty rhythm in `CASE-DOCKET-30.md` inform the 2026 design system
(`docs/DAILY-CASES.md`, PR D7).
