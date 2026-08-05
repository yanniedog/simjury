# COURT-WEEK.md — SimJury Court Week authority

**Status: ACTIVE. Owner decision: 2026-08-03.**

SimJury's only product is a single, substantial fictional criminal trial:
**Eleven Minutes**. The player occupies one jury seat across five weekday court
sessions and deliberates on Saturday and Sunday. Each session must measure
18–22 minutes from actual authored audio plus required interaction; the complete
week must measure 126–154 minutes.

## Product contract

- The seven sessions unlock sequentially at 08:30 `Australia/Hobart` using
  explicit ISO instants. Missed sessions remain available; future sessions do
  not unlock early; the completed case remains playable after Sunday.
- The experience is audio-first and fullscreen, with minimal persistent text,
  optional two-line captions, a reading mode, and an on-demand juror desk.
- Eleven authored jurors deliberate with the player. There is no multiplayer,
  account, runtime AI, analytics, waitlist, or backend player-state service.
- Progress, private notes and ballots stay on-device in IndexedDB. A versioned
  export/import file is the only cross-device transfer path.
- The active verdicts are Murder, manslaughter by criminal negligence, Not
  Guilty, and unable to agree. No outcome is presented as objectively correct.
- Individual juror positions stay sealed. An anonymous aggregate ballot is
  shown only after the player seals their own provisional position.

## Static day sealing and its limits

Future sessions are deterministic AES-GCM packs produced during the trusted
GitHub build. The public bootstrap contains only the seven unlock instants,
opaque pack locators and prerequisites. After the Hobart court time and prior
session completion checks pass, the browser dynamically loads that day's second
key fragment, fetches and authenticates the pack, then caches the opened session
on-device. Trial exhibits enter the juror desk only with the first day that uses
them; deliberation content does not enter the runtime before Saturday.

This is deliberate anti-spoiler friction, **not server-enforced secrecy**. The
repository and browser code are public, so a determined technical user can
recover the static key material. The enforceable guarantees are that ordinary
initial HTML, JavaScript, source maps, preload requests and encrypted pack bytes
contain no plaintext future dialogue or media map, and that the app itself makes
no future-pack request before both gates pass. Production build checks fail if
those guarantees regress.

### Owner developer preview exception

An owner-authorised, hidden `#developer` route may expose a password gate for
testing all seven sessions. This is anti-casual spoiler friction, not
authentication: the password plaintext is never committed or stored; only its
one-way verifier digest is public. Only after a successful in-page check may
the browser hydrate all static packs. The app does not persist the password,
decrypted packs, opened-pack cache or preview progress; normal browser-managed
HTTP caching of public static assets remains possible. Preview uses a fixed
developer clock and explicit day selector; its ephemeral progress must never
read or write normal IndexedDB progress.
It adds no backend, runtime operation, binding or recurring cost. Outside this
explicit preview, the ordinary schedule and prerequisite gates remain binding.

## Legal-order invariants

The trial state machine, authored record and validation must enforce:

1. empanelment, oath or affirmation, plea and preliminary directions before
   substantive evidence;
2. one continuous Crown case, complete before Crown closure;
3. defence election and evidence only after Crown closure;
4. Crown closing, defence closing, then judicial summing-up;
5. retirement, sealed player ballot, anonymous aggregate ballot, evidence-first
   deliberation, one jury note and an open-court answer;
6. no majority direction until unanimity has failed, more than eight disclosed
   in-world hours have passed, the judge directs further effort, and a fresh
   ballot follows further discussion; and
7. the accused standing while the verdict is returned in open court before any
   tally or analysis appears.

The authored case contains meaningful sustained and overruled objections,
cross-examination, confined re-examination, authenticated evidence, a single
credible post-answer strike, a no-adverse-inference direction, and a reachable
hung outcome. Struck material is unavailable to replay, notes, closings,
deliberation and analysis.

## Device and accessibility contract

The same complete legal experience must work at 320×568 through 2560×1440 CSS
pixels on current and previous-two-major versions of iOS Safari/Chrome, Android
Chrome, desktop Chrome/Edge/Firefox/Safari, and tablet portrait, landscape and
split-screen layouts.

- Use dynamic/small viewport units and safe-area insets; never require native
  fullscreen, orientation lock, hover, dragging, precision gestures or audio.
- Important artwork has phone portrait, tablet 4:3 and desktop 16:9 sources with
  authored focal/evidence-safe regions. No material fact may exist only in an
  image, crop, colour or sound.
- Touch targets are at least 44px. Keyboard, screen reader, forced colours,
  reduced motion, OS text enlargement, 200% zoom and reading mode are release
  gates. Layout must not scroll horizontally.
- Rotation, split-screen resizing, Fullscreen API denial, audio interruption and
  tab restoration must preserve the current legal state and resume at the last
  incomplete cue boundary.

See [`docs/DESIGN-PROTOCOL.md`](docs/DESIGN-PROTOCOL.md) for binding presentation
rules and the repository checks for the device matrix.

## Hosting, privacy and cost boundary

GitHub is the authoring, review and batch-processing platform. Trusted manual
GitHub Actions may generate, mix and verify media and publish immutable,
content-addressed Release assets. Cloudflare serves **Static Assets only**.

The Cloudflare configuration must contain no Worker entrypoint, Worker-first
route, binding, D1, Durable Object, KV, R2, Queue, AI, rate limiter, service,
plain-text variable, tail consumer, placement or observability configuration.
The static-only guard fails closed on any such addition. Heavy media is pinned
to an explicit GitHub Release tag; the browser never discovers `latest`.

Cloudflare may observe ordinary CDN request metadata. GitHub may observe media
request metadata, timing and opaque asset identifiers. Neither receives saved
progress, notes or ballots from SimJury. Player-facing content is reviewed and
pre-authored; no inference runs during play.

## Retired surfaces

- All ten former daily sittings and their canonical media are archived under
  `archive/daily-v2-2026-08-03/`, with SHA-256 provenance. Existing narration
  Releases are preserved and must never be clobbered because a source was moved.
- `/jury/` is canonical. `/today`, `/today/*`, `/play`, `/play/*`, `/install`
  and `/install/*` are compatibility redirects to `/jury/`.
- Old local-storage keys are not deleted or migrated. The Court Week player does
  not read them.
- D1/waitlist and live-room data retirement follows `docs/RUNTIME-RETIREMENT.md`.
  Export and destructive deletion are operator actions and never run in CI.

## Delivery rules

All work targets `site/app/`, the static site, related content, CI and docs.
The former Android/JVM and real historical tracks stay removed. PRs target
`main`, start as drafts, keep one concern, pass `validate` and
`bot-feedback-gate`, resolve substantive review feedback, and use the repository
single-shot arm-and-park workflow.
