# Court Week speech cutover boundary

**Status:** inactive forensic candidate only
**Roles:** Content Curator + Architect

`speechReviewLedger.ts` reconciles all seven candidate days against the current
active source and captions, but nothing imports those candidates into a pack or
the player. The current fallbacks must remain until one separately reviewed,
atomic content-and-media cutover completes every item below.

The generated `site/app/content-reviews/cw-0001.speech-review-sidecar.json` is
also non-runtime. It records exact source/candidate hashes, token boundaries,
speaker/legal metadata and eight pending human-review dimensions for every
ledger turn and runtime branch. `npm run review:speech:export` regenerates it;
`npm run review:speech:verify` (also included in `validate:cases`) rejects
missing, stale, reordered or unreferenced approval claims. Pending is not approval.

## Required atomic cutover

1. Merge each candidate cue and explicit turn into `content/sessions.ts` while
   preserving its scene, evidence, accessibility, admission and replay fields.
   Add the Sunday fresh-unanimity ballot as a real progress event and enforce
   the reviewed branch order in `engine/deliberation.ts` and progress state.
2. Extend the active pack/schema representation to retain canonical actor id,
   display label, speech mode, legal action and quoted-span provenance. Repace
   Monday and Tuesday captions from the new source turns without changing word
   order or letting one turn acquire another speaker's caption.
3. Replace the UI substitutions in `ui/CourtWeekApp.tsx` with the seven reviewed
   return variants and four reviewed analyses. Only then remove
   `openCourtReturnTurns`, `openCourtReturn` and `analysisForReturnedVerdict`
   from `engine/deliberation.ts`, plus the generic `sun-verdict-return`,
   `sun-verdict-confirm` and `Judge’s neutral case note` source wrappers.
4. Once every active cue carries explicit turns, remove speaker inference from
   `content/dialogueSpeakers.ts`, `content/cueTurns.ts`, caption pacing,
   `sealed/packPlan.ts` and `scripts/court-week-audio-jobs.ts`. Do not remove
   `attachCueTurns`, `splitCueTurns` or `DIALOGUE_SPEAKER_ALIASES` earlier:
   production packs, reading mode, evidence replay and narration still use them.
5. Replace the runtime-only exclusions in `media/runtimeCues.ts` with reviewed
   variant media/device-speech handling, then regenerate captions, audio jobs,
   sealed packs, media manifests and source digests under a new revision.
6. Rerun legal/read-aloud/signoff review, the pinned forensic ledger, complete
   tests and a manual Monday-to-Sunday playthrough before deleting candidate
   modules or changing the reviewed digest. No compatibility parser may remain
   the authority for legally operative speech after cutover.
