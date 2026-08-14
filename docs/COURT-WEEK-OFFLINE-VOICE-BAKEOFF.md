# Court Week offline Australian-voice bake-off

**Status:** authoring infrastructure only. It does not replace Kokoro, alter the
pinned production manifest, publish media, or authorise a voice donor.

## Hard boundary

- Inference runs on owned/donated hardware or a manually started, demonstrably
  non-billable cloud GPU. Never allow paid fallback or a billable endpoint.
- Incremental spend is capped at AUD 50 and recurring spend at AUD 0. Gameplay
  remains prerecorded; inference never enters the browser or a runtime service.
- Never commit raw references, consent documents, donor names or local paths.
  Free-cloud reference processing additionally needs explicit donor consent,
  ephemeral encrypted transfer and confirmed zero persistence; store only hashes.
- Generate and cache one attributed utterance per source/performance digest.
  Jobs resume by utterance; models never infer speakers in a multi-party cue.

Generate the review-only starting manifest and inspect its pinned revisions:

```powershell
cd site/app
npm run media:performance:manifest -- --output ../../.court-week-voice-review/performance.json
npm run media:performance:manifest -- --input ../../.court-week-voice-review/performance.json
```

`sourceDigest` currently covers ordered cues and legacy-separated turns for
bake-off only. Release readiness remains blocked until explicit reviewed turns
replace inference and `sourceContract` becomes `explicit-reviewed`.
`performanceDigest` additionally covers providers, casting, consent/reference
hashes and pronunciation projections. Do not copy either digest after a change.

## Verified acquisition, then no network

On a quarantined acquisition machine, fetch only the repositories and model
snapshots at the exact 40-character revisions in the manifest. Review each
licence from the pinned source. Build a canonical inventory containing relative
path, byte count and SHA-256 for every acquired file; store the SHA-256 of that
inventory as `artifactInventorySha256` and change that component to `verified`.
Do not substitute `main`, `latest`, an inference endpoint, or an unrecorded
package-manager download.

Move the verified bundle to the render host, then disable networking at the
container/VM boundary. Also set `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1` and
`PIP_NO_INDEX=1`. A successful render must use an empty network capture; a cache
miss is a hard failure, not permission to reconnect. Keep the encrypted donor
bank on a separate read-only mount excluded from output artifacts.

For each identity, independently hash the signed consent receipt and the exact
curated reference WAV. Record only those hashes plus a non-identifying
`voiceProfileId`. Consent must cover synthetic generation, public distribution
of outputs, regeneration for the fictional role and revocation handling.
After an intentional edit, refresh and immediately revalidate its digest with
`--input performance.json --refresh-digest --output performance.json`.

## Required three-way bake-off

Use identical source utterances, pronunciation projections and loudness-matched
review exports for:

1. **Chatterbox Multilingual V3** — English with the consented Australian
   reference; start at upstream neutral CFG/exaggeration settings.
2. **Chatterbox Turbo** — the same identity and text using its curated reference
   clip; treat paralinguistic tags as forbidden unless the source authors them.
3. **MeloTTS `EN-AU` + OpenVoice V2** — Melo supplies accent/prosody and
   OpenVoice converts only consented tone colour. OpenVoice's own QA warns that
   reference audio does not supply accent or emotion.

Primary sources: [Chatterbox](https://github.com/resemble-ai/chatterbox),
[MeloTTS](https://github.com/myshell-ai/MeloTTS), and
[OpenVoice](https://github.com/myshell-ai/OpenVoice). All pinned candidates in
the initial manifest identify MIT-licensed code and model metadata; re-check the
exact acquired snapshots before approval.

Target an ordinary eight-core PC with 32 GB RAM; an 8-12 GB consumer GPU is
optional, not assumed. CPU Melo is valid. A free cloud GPU may be started
manually only while its UI shows zero charge; abort before any paid upgrade.

## Approval and release hand-off

Use volume-matched blinded listening on reference headphones and a phone.
Reject any invented, missing, repeated or mispronounced legally material word;
speaker confusion; caricatured/non-Australian accent; unstable identity; or
misleading emotional emphasis. Pronunciation projections remain `proposed`
until legal read-aloud and accessibility reviewers approve them.

Before a later production-integration PR, all 28 identities must have distinct
reference hashes and provider voice profiles, every selected provider component
must be a verified offline acquisition, and every projection must be approved:

```powershell
npm run media:performance:manifest -- `
  --input ../../.court-week-voice-review/performance.json --require-ready
```

That later PR must retain the current eight exact-source signoffs, produce a new
immutable release tag, keep the current release as rollback, and re-run codec,
caption, loudness, asset-budget and browser-fallback gates. This bake-off file
is never a public Release asset or gameplay API.
