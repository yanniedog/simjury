# SimJury Court Week roadmap

## Active product

**Eleven Minutes** is SimJury's only case: five sequential weekday court
sessions followed by Saturday and Sunday deliberation. Each day measures 18–22
minutes. `/jury/` is the canonical route, the bare domain redirects there, and the case remains playable after its
shared launch week.

The binding product, legal, privacy and hosting contract is
[`COURT-WEEK.md`](COURT-WEEK.md). Interface rules are in
[`docs/DESIGN-PROTOCOL.md`](docs/DESIGN-PROTOCOL.md).

## Delivery sequence

1. Retire scheduled docket supply, live-room intake and the email waitlist.
2. Archive all ten Daily Docket sittings and canonical media with SHA-256
   provenance; preserve existing narration Releases.
3. Land the Court Week schema, legal state machine and validated authored record.
4. Land the fullscreen responsive shell, local progress/export and seven-session
   experience.
5. Produce and verify responsive artwork, scene audio and captions through a
   trusted manual GitHub Actions pipeline.
6. Run legal, accessibility, device, performance and spoiler-separation gates.
7. Cut over legacy routes, remove Cloudflare runtime bindings, and verify the
   production deployment on physical phone, tablet and desktop browsers.

## Release gates

- One active case and exactly seven sequential sessions.
- 18–22 measured minutes per session; all legal procedure gates pass.
- Equivalent complete play at 320×568 through 2560×1440, including 200% zoom,
  reduced motion, forced colours, keyboard and screen-reader journeys.
- Zero critical/high device defects and no known audio or progress loss.
- Cloudflare Static Assets only; no API, Worker, WebSocket, database or runtime
  inference traffic during play.
- Pinned GitHub Release hashes, sizes and durations match the manifest and all
  transfer/decode budgets pass.

## Retired tracks

The Android/JVM app, real historical case, rolling Daily Docket, case library,
live-jury beta, Discord integration and waitlist are retired—not deferred.
`archive/daily-v1/` and `archive/daily-v2-2026-08-03/` remain provenance only and
must never enter production bundles.

## PR discipline

One concern per PR, about 400 changed lines where practicable, default-branch
base, required deterministic gates, substantive thread resolution and squash
merge through the single-shot arm-and-park command.
