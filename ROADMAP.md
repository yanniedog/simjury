# SimJury Rollout Roadmap

## The Daily Docket

The Daily Docket is SimJury's only product track: fictional, contemporary cases
targeting a 15-minute sitting (14–16 minutes for V4) at `simjury.com/today`,
with a deterministic, client-side interactive jury room.

The delivery ladder and product constraints are recorded in
[`DAILY-PIVOT.md`](DAILY-PIVOT.md). Case design and validation live in
[`docs/DAILY-CASES.md`](docs/DAILY-CASES.md).

## Removed tracks

Owner decision, 2026-07-29: the Android/JVM application and real
historical-case track were removed from the repository. They are not parked or
deferred and must not be reintroduced. Old `/play` and `/install` routes redirect
to the Daily Docket landing path.

`archive/daily-v1/` remains as provenance for the retired fictional Victorian
daily docket and is not a shipped product surface.

## Current priorities

1. Maintain at least a fourteen-day fictional case runway behind schema, design,
   banned-token, jury-floor, and deliberation-dynamics gates.
2. Keep the complete first-time and returning-player journeys listenable,
   accessible, and low-friction.
3. Preserve static delivery for ordinary and solo traffic while keeping the
   live-jury Worker and its short-lived room state inside the strict allowlist.
4. Ship small, reviewable PRs through the required CI and bot gates.

## PR discipline

| Rule | Rationale |
|------|-----------|
| Max about 400 changed lines per PR | Reviewable; CI fast |
| One concern per PR | Clear rollback |
| Squash merge to `main` | Linear history |
| Wait for all required gates | No unresolved review feedback |
