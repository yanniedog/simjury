# Court Week governed Australian-voice bake-off

**Status:** review infrastructure only. It does not replace Kokoro, alter the
pinned production manifest, publish media, enable billing, or authorise a run.

## Hard boundary

- One-off managed batch TTS is permitted. Incremental spend is capped at AUD 50,
  recurring spend at AUD 0, and every run requires explicit manual approval.
- Gameplay remains prerecorded. No TTS, Workers AI, Cloudflare Worker, storage,
  queue, database, or other inference service enters production.
- A client ledger stops before 1,000,000 submitted characters, forbids blind
  retries, caches each utterance, and records the final provider bill.
- Never commit references, consent records, donor names, credentials, or paths.
  A provider receiving reference audio needs explicit donor consent.
- Generate one explicit attributed turn at a time and resume by utterance.

Generate with `npm run media:performance:manifest -- --output <file>` and validate
that file with `--input`. Release stays blocked until explicit reviewed turns
replace inference. The two digests separate source from performance decisions.

## Provider verification

For offline candidates, acquire only manifest-pinned revisions, review licences,
and hash a file/size/SHA-256 inventory. Verify its digest and render network-off.

For managed providers, record the exact model, docs, price, reviewed terms, and
voice-inventory digest. `pending` cannot release. Clones retain only consent and
reference hashes; stock assignments retain exact provider voice IDs.

## Candidate order

Use identical source turns and loudness-matched exports. Quality selects the winner.

1. **Google Cloud Chirp 3 HD `en-AU`** is the practical front-runner. Its current
   official inventory has 30 Australian-English stock voices: enough for 28
   identities without donor recordings or local neural inference.
2. **Cloudflare screening:** Aura 2 has only two documented Australian voices;
   hosted MeloTTS exposes `lang: en` without 28 selectable Australian identities.
   Reconsider only if a verified inventory reaches 28 distinct en-AU voices and
   passes the same blinded test.
3. **Chatterbox V3/Turbo and Melo EN-AU plus OpenVoice V2** remain optional
   challengers if external compute and consented references become available.

Sources: [Chirp voices](https://cloud.google.com/text-to-speech/docs/voices), [Chirp pricing](https://cloud.google.com/text-to-speech/pricing), [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Aura 2](https://developers.cloudflare.com/workers-ai/models/aura-2-en/), [Cloudflare Melo](https://developers.cloudflare.com/workers-ai/models/melotts/), [Chatterbox](https://github.com/resemble-ai/chatterbox), [MeloTTS](https://github.com/myshell-ai/MeloTTS), and [OpenVoice](https://github.com/myshell-ai/OpenVoice).

At 41,018 characters, Chirp is about USD 1.23 per full pass after free allowance;
Google currently lists the first million monthly characters free but requires
billing. Cloudflare Aura 2 is the same USD 0.03 per 1,000 characters and is not
cheaper per unit; its two en-AU voices fail casting. Cloudflare Melo is cheaper
but fails voice diversity.

## Release hand-off

Blind-test on headphones, laptop, and phone. Reject any word error, speaker
confusion, non-Australian/caricatured accent, unstable identity, or misleading
emotion. Before integration, all 28 identities need distinct profiles; every
selected managed inventory or offline acquisition and pronunciation projection
must be approved. Validate with `--require-ready`, publish a new immutable release,
keep the current release as rollback, and rerun codec, caption, loudness,
asset-budget, and browser-fallback gates. The review manifest is never public.
