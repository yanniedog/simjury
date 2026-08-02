# SimJury Rollout Roadmap

The Daily Docket is SimJury's only product track: fictional, contemporary cases
at `simjury.com/today`, played end to end in about twenty minutes with a
deterministic, client-side jury room.

Product constraints and the owner decision record live in
[`DAILY-PIVOT.md`](DAILY-PIVOT.md); case design and validation in
[`docs/DAILY-CASES.md`](docs/DAILY-CASES.md). This file is the rollout plan: what
is true now, what is next, and how each item is known to be done.

## Where the product actually is (2026-08-02)

The delivery ladder D0–D9 in `DAILY-PIVOT.md` is complete except its last content
step. Everything the ladder promised mechanically is shipped and live: the case
pipeline and gates, the deliberation engine, the courtroom reader, the jury room
with persuasion, reveal and sharing, the live-jury rooms, the site cutover, and
the email waitlist.

The content did not follow.

| Measure | Value |
| --- | --- |
| Cases in the docket | 7 (one is the intro) |
| Days in the next 14 that open a new case | **3** |
| Longest run on a single case | **4 days**, rising to 5 later in the month |
| Last case in the docket | **2026-08-18**, after which nothing new is ever shown |
| Cases on the V4 schema | **0 of 7** — the V4 consumer does not exist yet |

`caseForDate` serves the newest case published on or before today, so a docket
with gaps re-serves a trial the player has already sat through. The product is
named The Daily Docket and currently opens a new case roughly twice a week.

This is the plan's central problem. Everything below is ordered by it.

## Priorities

### 1. Case supply — the only thing currently blocking the product

Nothing else changes the experience while the docket opens a new case on three
days in fourteen. A returning player finds the trial they finished yesterday,
and on 2026-08-19 every player finds the same case indefinitely.

It is also now a promise. The landing page invites people to *"Hear when a new
case is filed"*, and the waitlist that collects those addresses is live. Asking
people to come back is only reasonable if there is something to come back to.

**Done looks like:** a new case every day, fourteen days ahead, sustained — the
`dd-0001…dd-0014` launch docket D7 called for, and a working cadence that
replenishes it.

**Enforced by:** `validate:cases` prints coverage on every run and fails on
regression. The floor is a ratchet: raise `MIN_DOCKET_COVERAGE_DAYS` toward 14 as
cases land, so the docket cannot quietly thin out again.

```text
docket coverage: 3/14 days open a new case — 4 day(s) in a row on the same case at worst
```

### 2. Build the V4 consumer, then migrate the slate

`DAILY-PIVOT.md` is explicit that V3 compatibility is transitional, and every
shipped case is still on the V3 schema.

Pacing is not the gap. All seven cases carry `dd-2026-v3-20min`, and
`checkDocketCase` runs `estimateV4Duration` against that profile, so the slate
is already held to the computed 19–21 minute window and the section floors.

The gap is the consumer. `cases.ts` validates V4 bundles but builds `allCases`,
`docketQueue` and every `DocketSitting` from flat V3 JSON only, so a V4 case
cannot reach `featuredDocketSitting` or the library. **Migrating or retiring the
V3 slate before that consumer exists would leave the app with no playable
case at all.**

**Done looks like, in this order:** V4 bundles become selectable sittings; then
new cases are authored V4 only; then the V3 slate is migrated. Not before.

**Enforced by:** the computed duration window on both profiles — authors cannot
declare a duration — and by the docket never being empty, which the coverage
gate above now measures.

### 3. Make the repeat day honest

Until (1) is solved, some days re-serve yesterday's case. The page currently
presents it as though it were new. A player who has already returned a verdict
should be told what they are looking at and offered the case library, rather
than left to work out that nothing changed.

**Done looks like:** a returning player on a repeat day sees that it is a repeat,
and has somewhere to go.

This is a stopgap. It stops being needed the moment (1) is true, and it must not
become the reason (1) feels less urgent.

### 4. Keep the surface honest and bounded

Standing work rather than a milestone: ordinary and solo traffic stays static;
only `/api/live/*`, `/api/waitlist` and `/discord/interactions` reach the Worker;
player-facing claims match what the code stores. `guard:cloudflare` pins the
route list, the D1 binding and the schema file.

## Not being done

Recorded so they are not rediscovered as ideas:

- **Android/JVM and real historical cases** — removed by the owner on 2026-07-29.
  Not parked, not deferred. `archive/daily-v1/` is provenance, not a case source.
- **Accounts and login** — the waitlist deliberately neither creates nor implies
  one. A separate track if it ever happens.
- **Sending mail from the Worker** — export the list instead. A mail credential
  in the Worker that serves the site widens the blast radius of the whole
  deployment for a job that runs a few times a year.
- **Runtime AI** — case generation happens in PRs, never during play.

## PR discipline

Merge through the one entry point:

```sh
npm run pr:arm-and-park -- --pr <n>
```

It refuses a base weaker than the default branch, waits for a review already in
progress, and parks instead of polling. Never hand-roll `gh pr merge --auto`:
that skips both checks, and the table below is only a description of what the
command already enforces.

| Rule | Rationale |
| --- | --- |
| About 400 changed lines per PR | Reviewable; CI fast |
| One concern per PR | Clear rollback |
| Squash merge to `main` | Linear history |
| Target the default branch, always | A PR based on a feature branch can merge unreviewed |
| Many PRs open at once, never stacked | Each is reviewed on its own diff and lands on its own gates |
| Let an in-flight review land before merging | Auto-merge waits only for *required* checks, so an armed PR can outrun the review |
