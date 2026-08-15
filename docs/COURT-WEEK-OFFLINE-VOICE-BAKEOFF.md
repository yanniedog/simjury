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

Canonical turn text is also the spoken script: write names, times, ordinary
numbers, abbreviations and homographs so an Australian reader can say them one
natural way. The deterministic pronounceability audit blocks generation until
every flagged form is removed or reviewed. Provider-only pronunciation changes
are an exception limited to statutes and identifiers, bound to one exact turn
and source digest; they may never repair a character name or ordinary dialogue.
Character names must sound natural in a contemporary, culturally varied
Australian courtroom. Do not use fantasy-style names, phonetic respellings or
stereotypical Australian names merely to steer a speech engine.

## Candidates

1. **Google Chirp 3 HD `en-AU`** leads: its official inventory has 30 Australian
   voices, enough for 28 identities without donor audio or local neural inference.
2. **Cloudflare:** Aura 2 has only two documented Australian voices and hosted
   Melo exposes no 28-voice en-AU inventory. Re-screen if that catalogue changes.
3. Chatterbox V3/Turbo and Melo EN-AU plus OpenVoice remain optional challengers.

Sources: [Chirp voices](https://cloud.google.com/text-to-speech/docs/voices), [Chirp pricing](https://cloud.google.com/text-to-speech/pricing), [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Aura 2](https://developers.cloudflare.com/workers-ai/models/aura-2-en/), [Cloudflare Melo](https://developers.cloudflare.com/workers-ai/models/melotts/), [Chatterbox](https://github.com/resemble-ai/chatterbox), [Melo](https://github.com/myshell-ai/MeloTTS), and [OpenVoice](https://github.com/myshell-ai/OpenVoice).

The reviewed candidate currently plans 48,242 provider characters because
pending pronunciation proposals may not alter provider text. At the frozen
14 August 2026 RBA rate, one complete Chirp pass is about USD 1.45 / AUD 2.05
before free usage, and potentially AUD 0 within Google's one-million-character
monthly allowance. Billing must still be enabled and the plan conservatively
budgets the gross amount. Cloudflare Aura 2 has the same gross character price
but only two documented Australian voices, so it cannot meet the 28-identity cast.

The frozen catalogue verifies availability, not suitability. Audition all 30,
select 28 only after blind listening, and test the selected cast on headphones,
laptop, and phone. Reject word, attribution, accent, identity, or emotion defects.
Different provider IDs do not prove perceptibly different characters. Rank the
audition pool for blinded distinctness and place the strongest contrasts between
speakers who share scenes; if the required identities cannot be recognised
reliably, the provider or casting fails.
Publish only a new immutable static release with rollback.

## Chirp audition operator gate

`npm run media:chirp:audition` only prints a deterministic 30-voice plan. It
does not inspect credentials, write files or call Google. The same short,
non-production courtroom passage is submitted once per frozen stock voice and
the gross estimate deliberately applies no free tier.

Execution is a separate, manual operator action. Create an output directory
outside this repository, enable billing and Text-to-Speech for the intended
quota project, then obtain a short-lived bearer token from the active `gcloud`
account without printing or committing it. Application Default Credentials are
not required by this runner:

```powershell
$env:GOOGLE_OAUTH_ACCESS_TOKEN = gcloud auth print-access-token --quiet
$env:GOOGLE_CLOUD_QUOTA_PROJECT = '<reviewed-project-id>'
npm run media:chirp:audition -- --execute --output '<existing-outside-repo-directory>' --acknowledge-cost-aud '<exact value printed by the plan>'
Remove-Item Env:GOOGLE_OAUTH_ACCESS_TOKEN
Remove-Item Env:GOOGLE_CLOUD_QUOTA_PROJECT
```

The runner uses Google's synchronous REST endpoint once per unfinished job,
never retries, and writes content-addressed MP3/JSON pairs exclusively. A
matching pair resumes without a request; a partial or mismatched pair stops
without overwrite. Sidecars retain request, response and audio hashes plus
allowlisted provider metadata, never the token, project header or local path.

Technical contracts: [REST synthesis](https://docs.cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize),
[REST authentication](https://docs.cloud.google.com/docs/authentication/rest),
and [pricing](https://cloud.google.com/text-to-speech/pricing).
