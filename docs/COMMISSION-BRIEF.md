# Commission brief — an autonomous rolling seven days of Daily Docket

Paste everything below the rule into the drafting agent. It is written to be
self-contained: it assumes no prior conversation.

---

## Who you are and what you are doing

You are working in the GitHub repository `yanniedog/simjury`. Its only product is
**The Daily Docket** at `simjury.com/today`: one fictional criminal trial per day,
played end to end in about twenty minutes, with a deterministic client-side jury
room where eleven authored jurors deliberate and the verdict is earned rather
than scripted.

Your task is to make the docket genuinely daily for a rolling **seven-day
window — today plus the next six UTC dates** — keep it that way without being
asked again, and make every sitting capable of becoming the case people tell a
friend to play. Aim for the standard of an award-winning crime podcast: a
listener carried through the story *and* the procedure without ever feeling
lectured, manipulated or lost.

This is an owner decision dated 2026-08-02: the case-supply loop no longer has a
mandatory human editorial or approval checkpoint. Agents own drafting,
independent editorial passes, legal and sensitivity review, media, verification,
review-feedback fixes and merge readiness. Work still goes through pull requests;
`validate` and `bot-feedback-gate` still block merge; substantive review threads
still must be resolved. Never write generated content directly to `main`.

## Where things are

| Path | What it is |
| --- | --- |
| `site/app/` | The React/TypeScript app. All product work happens here. |
| `site/app/docket/*.json` | The cases themselves, one file per case. |
| `site/app/src/lib/v2/caseSchema.ts` | Case schema. Zod; the gate is derived from it. |
| `site/app/src/lib/v2/caseQuality.ts` | Design-quality gates, including the corpus rule. |
| `site/app/src/lib/v2/offenceProfiles.ts` | The seven canonical grave-offence profiles. |
| `site/app/src/engine/` | Deliberation engine. Deterministic and seeded. |
| `site/app/public/media/<case-id>/` | `cover.webp` and `characters/` per case. |
| `site/scripts/speaker-voices.mjs` | Narration voice assignment. |
| `.github/workflows/docket-supply.yml` | Daily job that reports what the docket needs. |

Authority documents, in precedence order: `CLAUDE.md`, `DAILY-PIVOT.md` (the
owner's decision record), `docs/DAILY-CASES.md` (design system),
`docs/DAILY-PROMPT-PACK.md` (drafting template), `docs/DOCKET-SUPPLY.md`
(supply contract), `ROADMAP.md` (priorities).

Commands you will need:

```sh
cd site/app
npm ci
npm run lint && npm run typecheck && npm test
npm run validate:cases          # schema, design, jury floors, dynamics, pacing
npx tsx scripts/docket-supply.ts # what the docket is missing, by date
```

## The current state, measured

Do not take this on trust — re-run the commands above, because dates move.

As of 2026-08-02 the docket holds **six dated cases plus a guided intro**, spread
across three weeks: 2026-07-28, 08-01, 08-05, 08-09, 08-13, 08-18. A player
returning tomorrow is re-served the trial they finished yesterday, for up to five
days running, and after 2026-08-18 the same case forever.

`docketCaseForDate` returns the newest case published on or before today, so gaps
are invisible in the UI rather than empty.

## The arithmetic for the first seven days

The seven-day window is 2026-08-02 through 2026-08-08. Exactly one existing case
falls inside it (08-05).

Three cases are dated in the future and **not yet published**, so re-dating them
is safe and remaps nothing a player has seen: 08-09, 08-13, 08-18. Move them onto
empty days in the window. That takes coverage to four of seven.

**You therefore need three new cases**, giving nine dated cases plus the intro.

Do not re-date 2026-07-28 or 2026-08-01. They have already published, and publish
dates are canonical: a past sitting must never be remapped.

This deliberately replaces the old fourteen-day supply contract. Change
`MIN_DOCKET_RUNWAY_DAYS`, the coverage floor, `docket-supply`, its workflow,
tests, `docs/DOCKET-SUPPLY.md`, `docs/DAILY-CASES.md`, `ROADMAP.md` and the owner
decision record so they all mean the same thing: seven dates including today,
not seven dates after today and not a fortnight. The horizon check must end on
day seven (`today + 6`); full coverage is `7/7`, and the scheduled run tomorrow
commissions the newly exposed seventh date.

## The one rule you must change first

`checkV3Corpus` in `site/app/src/lib/v2/caseQuality.ts` assumes the docket holds
*exactly* `OFFENCE_CODES.length` cases — seven. `docs/DAILY-CASES.md` rule 4
states the same intent: "the guided intro plus six dated sittings". It also
returns early as soon as a mixed V3/V4 queue exists, so merely adding the new V4
cases would silently disable its profile checks.

Replace it with a version-independent active-corpus gate and land that as its
own first PR.

The old rule conflates two different things: how many offence *profiles* exist,
and how many *cases* are queued. Decouple them. Every case must still use one
canonical grave-offence profile, the active corpus must still exercise every
profile, and repeated profiles must use materially different central inferences,
evidence mechanisms and human conflicts. The case count tracks the rolling
seven-day supply target rather than the profile-list length. Update the rule
text, the gate and its tests in one PR, covering mixed V3/V4 queues explicitly.

## Then: the daily loop

`.github/workflows/docket-supply.yml` runs every morning, works out which of the
next seven days open no case, and maintains a single issue naming those dates.
The controller reserves and generates one complete case per draft pull request,
then queues another run until every uncovered date has its own reservation. This
keeps the output, image and spend ceilings exact per case while allowing several
case PRs to progress independently. Billed attempts are recorded in the
reservation state even when generation fails, so a resumed run cannot reset the
budget. The issue is a machine-readable work record, not a request for a person
to take over. Preserve these properties:

- It **names dates, not a quantity.** Three cases filed on one day leave the
  docket exactly as thin as before.
- It opens **a draft pull request** and never writes to `main`.
- A second agent/editorial pass reviews story logic, legal clarity, language and
  sensitivity before the PR is marked ready. Record the actual agent/model and
  pass in `gen_meta`; never put a fictional human name in a reviewer field.
- Required CI and bot feedback are the merge bar. No human approval is required.
- A missing model, image provider, credential or budget is an actionable setup
  failure reported by the workflow, not permission to ship a partial case.

Amend `DAILY-PIVOT.md` and the other authority documents in the supply-contract
PR to record that this 2026-08-02 owner decision supersedes the earlier mandatory
human spot-check wording for generated Daily Docket cases.

## What a finished case contains

A case is not shippable until every part exists. Half a case in the docket is
worse than an honest gap, because a gap is at least visible.

### Script — the podcast standard

Write for the ear. A cold open that plants a question. Evidence introduced in an
order that lets a listener build a picture rather than receive a list. Procedure
explained *as it happens*, never as a preamble. Counsel who sound like two people
who genuinely believe opposite things, not two halves of one argument. Judicial
directions in plain English a first-time juror can actually act on.

Nothing may be padded to reach a length. The 19–21 minute sitting is **computed
from content** by `estimateV4Duration`; you cannot declare a duration, and
inflation shows up immediately in the estimate. A valid case carries 1,500–1,800
spoken words, with at least 180 reserved for the juror briefing, 320 for rival
openings and closings, and 900 for evidence and directions.

### Popularity is an editorial outcome

Do not confuse popular with sensational. A case earns attention when the hook is
immediate, the people matter, both theories are tempting, the evidence rewards
attention, and the ending makes the player want to compare reasoning with
someone else.

Use deep familiarity with captivating crime drama, high-retention true-crime
audio and widely discussed courtroom moments to guide creative judgment. Borrow
their **engagement mechanics**, never their identities, events or distinctive
fact patterns. The useful mechanics are:

- **Intent in the first thirty seconds.** Open inside a consequential moment with
  one vivid image, action or disputed sentence. Orient immediately; do not tease
  vaguely or delay the premise.
- **A mystery the player can genuinely work.** Suspense comes from psychology,
  forensic limits and competing interpretations of admissible facts—not from
  hiding information or springing an unearned ending.
- **People before pathology.** Centre the life altered by the alleged crime and
  give the accused equal human specificity without presuming guilt. Nobody is a
  corpse, monster, diagnosis or plot device.
- **One courtroom moment worth retelling.** Build toward a fair, comprehensible
  hinge: a disputed admission, an apparently simple record whose limitation
  matters, a witness who survives or buckles under a precise question, or a
  ruling that changes what the jury may use.
- **One iconic evidentiary object.** A pass log, handwritten correction, damaged
  seal, receipt, voice message or physical trace should be easy to picture and
  discuss, but never sufficient without context and foundation.
- **Psychological conflict with legal consequence.** Loyalty, shame, coercion,
  status, grief, self-protection or misplaced certainty matters only when it
  changes credibility, knowledge, intent, causation or another charged element.
- **A fair reversal, not a gotcha.** Later evidence changes the meaning of at
  least two earlier details. On replay, the construction should feel inevitable
  and honest rather than arbitrary.
- **Player agency with responsibility.** The strongest drama ends not with the
  narrator announcing an answer but with the player deciding which competent
  account survives reasonable doubt, arguing it, and seeing the authored jury
  respond.
- **A discussion-shaped ending.** The reveal resolves the evidentiary design but
  leaves a humane question about judgment, trust or consequence that two careful
  players can disagree about. The spoiler-safe share prompt asks what changed
  their mind, not merely which verdict they chose.

Across the rolling week, vary the source of suspense: identity, intent,
causation, knowledge, credibility, coercion and command. Do not publish seven
variations of “a timestamp proves the accused lied.” At least two cases should
turn primarily on human testimony, at least two on a tangible record or physical
finding with a real limitation, and at least one on a legally meaningful
objection or exclusion that a first-time juror can understand.

Before filing a case, run two independent agent editorial passes. Rewrite until
both passes can answer yes to all of these:

- Can the case's central tension be repeated to a friend in one spoiler-free
  sentence?
- Do the first thirty seconds create a concrete unanswered question while still
  telling the listener where they are and what is at stake?
- Do the accused and the opposing human each want something understandable
  beyond winning the case?
- Can a careful player identify the strongest competent fact for each side on
  one listen?
- Does at least one fair reversal change the meaning of an earlier detail
  without withholding a fact the jury should already know?
- Are the title, cold open and final reveal specific to this case rather than
  reusable genre copy?
- Does the deliberation create a real urge to discuss the case without revealing
  hidden truth or forcing a verdict?
- Would the case remain gripping if every proper noun were removed? If not, it
  is leaning on topical resemblance rather than construction.

Reject shockbait, arbitrary twists, misery as decoration, copied news stories,
fake controversy and difficulty created by confusion. Do not add player
surveillance or runtime analytics to claim popularity; any measurement product
is a separate privacy and cost decision.

### A courtroom that feels alive

The schema has no field for objections, rulings or ambience. Extend
`caseSchema.ts` before drafting content that needs them:

- An interjection carrying its speaker, a type (`objection`, `sustained`,
  `overruled`, `ruling`, `admonition`), the beat it attaches to, and its text.
- An ambience track per phase.

Then extend the design gate so interjections are **earned**. An objection with no
evidentiary basis is worse than none: each should teach the player something about
the record — leading, hearsay, relevance, speculation, argumentative. A sustained
objection must genuinely change what the jury may consider, and the post-verdict
analysis must reflect that it did.

Ambience sits under the narration and never competes with it: a room settling
before the judge enters, the different quiet of deliberation. It must be optional
and must respect the existing narration toggle.

Schema is not delivery. Wire both features through every consumer: case loading,
the courtroom player, visual ordering, Kokoro job construction, browser fallback,
pause/resume, narration-off behaviour and post-verdict analysis. Add tests that
prove an interjection appears and is spoken at the authored point, excluded
evidence is not later treated as competent, ambience stops immediately with
narration, and a case remains fully playable when either audio asset is absent.

### Voices

Extend the existing Kokoro pipeline in `site/scripts/speaker-voices.mjs`. It
already reserves `af_heart` for the narrator and `bm_george` / `bf_emma` for
judges, and walks a gender-matched pool so speakers stay as distinct as the
catalogue allows. `castGenders.json` pins each speaker's gender so a voice cannot
drift between runs.

If you want a higher-fidelity engine, propose it as **its own PR** with the
licence, cost and runner requirements stated. Do not swap it silently: Kokoro is
Apache-2.0 and runs in GitHub Actions, and both properties are load-bearing for
the project's licensing and its no-runtime-AI rule.

### Images

Follow `site/app/docket/MEDIA-GUIDE.md` exactly. Per case: `cover.webp`, a
`characters/` portrait of the accused grounded in an authored life detail, and a
portrait giving the complainant or opposing witness equal humanity. Beat images
only where the image changes how a juror reads the record — not one per paragraph.

Court images are charcoal and ink with selective watercolour and contemporary
dress. No wigs, gavels, sepia, or historical nostalgia. Evidence images preserve
the ambiguity the jury meets them with.

Every speaking character still needs the individual courtroom portrait required
by `docs/DAILY-CASES.md`: judge, counsel, accused, witnesses and all eleven jurors.
The accused/opposing-human images and selected beat reconstructions are additional
story media, not substitutes for those portraits.

No image pipeline exists in the repository; the current slate's art was produced
outside it. The agent executing this commission owns generating and checking the
first window's art with its available image capability. Sustainable unattended
generation is a PR of its own: pin the provider/model, maximum images and spend
per case, secret handling, licence, failure behaviour and a kill switch. It may
not merge until those limits are explicit, but it does not require a human art
approval step once configured.

## Invariants — owner decisions, not preferences

Breaking one of these is worse than shipping nothing.

- **Fiction, and it says so.** `label: "fiction"` on every case. Cases use real
  trial *patterns*, never real events. A banned-token scan enforces this.
- **No real names** of people, companies, brands or specific places in any
  player-visible text. Invent business names; describe platforms by genre
  ("a rideshare app"), never by brand.
- **No runtime AI.** Case generation happens in pull requests. Everything a
  player sees is pre-authored JSON by the time they see it. Narration is
  generated in Actions, never synthesised during play.
- **Static-first hosting.** Only `/api/live/*`, `/api/waitlist` and
  `/discord/interactions` may reach the Cloudflare Worker.
- **Adult, concrete, non-operational.** State the specific facts an adult juror
  needs — weapon or device category, quantities, chronology, injuries. Never a
  reproducible assembly sequence, recipe, trafficking route, security weakness,
  or evasion method.
- **Sealed deliberation.** Seat leanings and tallies stay hidden until the judge
  reads the result.
- **Provenance stays.** `archive/daily-v1/` is retained verbatim and is not a
  case source.
- **Removed tracks stay removed.** The Android/JVM app and the real
  historical-case track were deleted by the owner on 2026-07-29. Do not
  reintroduce them.

## How to land work

These rules exist because each was broken once and cost real time.

- **One concern per PR, about 400 changed lines, squash merge.**
- **Always target the default branch.** `gh pr create --base main`. Never stack a
  PR onto another feature branch: branch protection attaches to `main`, so a
  stacked PR merges within seconds, completely unreviewed. This happened.
- **Many PRs may be open at once.** They are reviewed in parallel and each lands
  on its own gates. Only a genuine dependency chain serialises, and only at merge
  time — keep the chain local, point every PR at `main`, rebase as parents land.
- **Merge only through `npm run pr:arm-and-park -- --pr <n>`.** It refuses a base
  weaker than the default branch, arms squash auto-merge and classifies the PR in
  one shot. Never hand-roll `gh pr merge --auto`; it skips repository safeguards.
- **Never poll or `--watch`.** Arm, park, come back.
- **Never destroy uncommitted work.** `git checkout --`, `git reset --hard`,
  `git stash drop` and force-pushes are irreversible. Commit a checkpoint first.
- **Act on bot review feedback.** CodeRabbit, Sourcery and Codex review every PR;
  resolve every thread before merge. Treat their findings as real until you have
  checked them against the code — they have caught genuine defects here.

## Definition of done

- `npx tsx scripts/docket-supply.ts` prints `nothing to commission`.
- `npm run validate:cases` passes and prints
  `docket coverage: 7/7 days open a new case — a new case every day`.
- Every case in the window has its script, narration, images, interjections and
  ambience.
- Every case passed two recorded independent agent editorial passes, including
  the popularity checklist, legal clarity, language, sensitivity and complete
  first-time listenability.
- The player actually renders and plays interjections and ambience; they are not
  merely accepted by the schema.
- `npm run lint`, `npm run typecheck`, `npm test` all pass.
- The daily workflow closes its own issue after the covering PR merges, then
  commissions the newly exposed seventh date on its next scheduled run.
- Every change reached `main` through a pull request with `validate` and
  `bot-feedback-gate` green and all substantive threads resolved. No human
  approval is required.

## How to report

Say what you changed, what you verified, and what you could not do. Do not ask a
person to perform editorial work that the agents, deterministic gates and review
bots can complete. If an invariant, missing credential or cost boundary blocks
you, stop and report that concrete blocker — do not route around it or ship a
partial case. If a bot review contradicts you, check the code before assuming
either of you is right.
