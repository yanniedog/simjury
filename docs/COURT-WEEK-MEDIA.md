# Court Week prerecorded media production

Court Week audio is produced in GitHub Actions and played as static files. No
voice model, inference endpoint, database or Cloudflare runtime operation is
part of gameplay.

## Reviewed source contract

`site/app/scripts/court-week-audio-jobs.ts` reads the checked-in
`TrialRecord`/`SessionPresentation` and emits deterministic JSON jobs. The job
digest covers the case revision, release tag, session, cue order, exact spoken
text, voice casting, pauses and fixed interaction/transition time.

Every authored speaker has an explicit Kokoro voice. A new, removed or renamed
speaker fails the build until the casting map is reviewed. The week currently
produces eight audio segments per day: one per authored scene except Monday,
whose first scene is split once at a cue boundary. All 125 cues remain in their
original legal order.

Run the source-only checks locally without downloading a model:

```powershell
cd site/app
npm test -- --run scripts/court-week-audio-jobs.test.ts
npm run media:audio:jobs -- --output ../../.court-week-audio-jobs
```

The generated job directory is review material, not a production asset.

## Trusted GitHub build

The `court-week-media` workflow is manual-only and accepts an immutable release
tag. Leave `publish` false for the first run. It:

1. checks out the exact `main` commit and runs the complete app validation;
2. creates and validates deterministic source jobs;
3. uses seven GitHub-hosted CPU jobs (at most three concurrently) to run Kokoro;
4. mixes each segment, normalizes dialogue to -18 LUFS, and emits Opus, AAC in
   M4A, MP3 and timed WebVTT;
5. probes every encoded rendition for duration, integrated loudness, true peak
   and loudness range;
6. packages opaque SHA-256 filenames plus provenance and runtime cue ranges;
7. uploads a seven-day private review artifact retained for seven days.

The workflow records the exact Python, FFmpeg, Kokoro, Torch, NumPy and
SoundFile versions used by every matrix job and rejects mixed environments.

The optional publish job is the only job with `contents: write`. It refuses to
replace an existing tag. Do not set `publish` true until the review artifact,
the fixed revision and the app's pinned runtime manifest have all been reviewed.

## Blocking media gates

Production packaging fails unless:

- all seven source-job digests match their generated session manifests;
- every source cue has exactly one ordered time range and no generated asset is
  unreferenced;
- every day has 8-12 segment files in all three codecs plus VTT;
- measured narration plus authored interactions/transitions is 18-22 minutes;
- every codec remains between -20 and -16 integrated LUFS, below -0.5 dBTP and
  at or below 12 LU loudness range;
- each codec's daily transfer is at most 15 MB and its seven-day path at most
  100 MB;
- every individual media file is at most 12 MB; and
- the complete release is below 150 MB and 500 assets.

`court-week-media-manifest.json` maps each cue to an interval inside a shared
scene file and maps each codec to a content-addressed Release asset. It excludes
spoken text and speaker names. It must be pinned into the reviewed static/day-
pack build before the app can use scene-range playback; fetching it dynamically
from GitHub is incompatible with the site's `connect-src 'self'` policy.

## Strict scene-art gate

`site/app/scripts/scene-art-requirements.ts` generates a manifest keyed to all
55 authored scene IDs. Each key owns six unique conventional paths:

[`COURT-WEEK-ART-BIBLE.md`](COURT-WEEK-ART-BIBLE.md) is the human continuity
gate for the fixed courtroom geography, recurring cast and chronological
contact-sheet review. Binary validity never overrides a continuity rejection.

- `portrait.avif` and `portrait.webp`, 9:16 and at least 720x1280;
- `tablet.avif` and `tablet.webp`, 4:3 and at least 1024x768; and
- `desktop.avif` and `desktop.webp`, 16:9 and at least 1280x720.

Every entry also requires an ambiguity-preserving alternative description,
focal point, subject-safe rectangle, evidence-safe rectangle and one or more
permitted caption positions. Safe regions are percentages in a 0-100 coordinate
space and must be non-empty and remain fully inside the composition.

Run the source and binary audits with:

```powershell
cd site/app
npm test -- --run scripts/scene-art-requirements.test.ts
npm run media:art:test
```

The release audit reads dimensions directly from both AVIF and WebP files. It
also requires matching dimensions between codecs, rejects undersized or wrongly
shaped compositions, unsafe paths, copied bytes, generic/shared/fallback names
and visual files not owned by a manifest entry.

Missing commissioned art remains explicit: the authoring map does not invent
safe regions and the build never copies a generic image into 55 paths. A manual
workflow run with `publish: false` succeeds after the other media gates and
uploads the complete `art-readiness-report.json`. A run with `publish: true`
fails before the publish job whenever that report is not fully release-ready.

### Two-scene Release strips

Conventional six-rendition scene files are review sources, not the final
GitHub Release layout. `media:art:strips` deterministically joins chronological
pairs within one court day. A strip never crosses a session boundary and an
unpaired final scene receives a neutral second cell that is not mapped as a
scene. Only a wholly commissioned day is emitted.

```powershell
cd site
npm --prefix app run media:art:requirements -- --output <requirements.json>
node scripts/scene-art-strips.mjs `
  --requirements <requirements.json> `
  --media-root court-week-art/cw-0001 `
  --output-root <review-output>
```

The completed week contains 28 strips. Three compositions and two codecs make
168 art assets; the fixed 56 audio segments and their four renditions make 224
more. With its opaque public inventory, the projected Release contains 393
assets and retains a 107-asset safety margin below GitHub's 500-asset project
gate. The semantic runtime map, source provenance and readiness report remain
private review artifacts; they are never published with the Release.

Two-scene strips are deliberate. They keep only the current and next scene in
one decoded image (at most 2560 pixels on an edge). A whole-day atlas would
decode seven or eight scenes, reach 5120 pixels and violate the performance
contract despite using fewer Release assets.

The strip manifest is private review/build material: it contains legal-order
scene IDs and semantic paths. A later packaging phase must content-address the
strip files, seal only one day's opaque mapping into its day pack, and exclude
the source manifest and logical paths from public Release assets. Until that
runtime cutover is complete and the immutable Release is pinned, reviewed
scene files remain in the static development path and production remains
fail-closed.
