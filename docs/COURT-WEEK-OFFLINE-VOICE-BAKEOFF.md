# Court Week governed Australian-voice bake-off

**Status:** review infrastructure only; it does not replace Kokoro, publish media,
enable billing, or authorise a synthesis run.

## Contract

- Managed batch TTS is allowed only as a manually approved build step: AUD 50
  maximum incremental spend, AUD 0 recurring, and no inference service at runtime.
- Production remains static: no TTS, Workers AI, Worker, database, queue, or storage.
- Stop before 1,000,000 submitted characters; forbid blind retry; cache each
  utterance by source and synthesis digests; record the final bill.
- Never commit references, consent, donor identities, credentials, or local paths.
  Reference-based providers require donor consent; stock voices do not.
- Generate one explicit reviewed turn at a time and resume by utterance.

Generate with `npm run media:performance:manifest -- --output <file>` and recheck
with `--input <file>`. Release requires explicit authored turns, separate synthesis
and governance digests, verified provider inventory, and approved pronunciations.

## Candidates

1. **Google Chirp 3 HD `en-AU`** leads: its official inventory has 30 Australian
   voices, enough for 28 identities without donor audio or local neural inference.
2. **Cloudflare:** Aura 2 has only two documented Australian voices and hosted
   Melo exposes no 28-voice en-AU inventory. Re-screen if that catalogue changes.
3. Chatterbox V3/Turbo and Melo EN-AU plus OpenVoice remain optional challengers.

Sources: [Chirp voices](https://cloud.google.com/text-to-speech/docs/voices), [Chirp pricing](https://cloud.google.com/text-to-speech/pricing), [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Aura 2](https://developers.cloudflare.com/workers-ai/models/aura-2-en/), [Cloudflare Melo](https://developers.cloudflare.com/workers-ai/models/melotts/), [Chatterbox](https://github.com/resemble-ai/chatterbox), [Melo](https://github.com/myshell-ai/MeloTTS), and [OpenVoice](https://github.com/myshell-ai/OpenVoice).

The reviewed candidate currently plans 45,260 provider characters. At the frozen
14 August 2026 RBA rate, one complete Chirp pass is about USD 1.36 / AUD 1.92
before free usage, and potentially AUD 0 within Google's one-million-character
monthly allowance. Billing must still be enabled and the plan conservatively
budgets the gross amount. Cloudflare Aura 2 has the same gross character price
but only two documented Australian voices, so it cannot meet the 28-identity cast.

The frozen catalogue verifies availability, not suitability. Audition all 30,
select 28 only after blind listening, and test the selected cast on headphones,
laptop, and phone. Reject word, attribution, accent, identity, or emotion defects.
Publish only a new immutable static release with rollback.
