# Pinned Court Week runtime media

The reviewed, text-free runtime manifest is pinned here as
`court-week-media-manifest.pinned.json` only after the private GitHub Actions
artifact passes review. It is never published with the GitHub Release or
fetched at runtime, and must not contain cue text or speaker names.

When present, `npm run build:packs` validates its exact case revision, immutable
release tag, seven sessions and complete cue coverage, then places each
session's cue ranges, chronological two-scene art map and opaque asset names
inside that day's AES-GCM pack.
Until a final manifest is pinned, the site deliberately uses device speech or
reading mode. Never commit generated audio binaries here.
