# Case generation

How a new daily case is made. Follow this whether a human or an LLM is drafting;
the CI gate (`npm run validate:cases`) enforces the hard rules, but the taste
lives here.

## The one rule that overrides everything

**Every case is fiction, and it says so.** `label` is pinned to `"fiction"`. Do
**not** dramatise a real crime, real trial, or real person — that path invents
false claims about real people. Cases are built from *patterns* real trials
share (eyewitness error, motive-without-method, forensic misreads), never from a
real event. **No real names** of people, companies, or specific places in any
player-visible text. Use roles ("the neighbour", "the site foreman") and invented
business names.

Real historical cases only ever ship through the pilot repo's separate,
human-cleared harness — never through this pipeline.

## What a case is

A 3-minute trial the player judges. Shape (see [`src/lib/caseSchema.ts`](../src/lib/caseSchema.ts)):

| Field | Meaning |
|---|---|
| `charge` | The single accusation, plain language. |
| `elements` | 2–4 things the prosecution must prove. |
| `beats` | 4–6 evidence beats, in the order shown. |
| `verdict_truth` | `Guilty` or `Not Guilty` — the correct answer. |
| `twist` | 1–3 sentences shown at the reveal: why the obvious read was wrong. |
| `difficulty_target` | 0..1, your honest estimate of how easily people are fooled. |

Each **beat**:

| Field | Meaning |
|---|---|
| `kind` | `witness` \| `exhibit` \| `direction` (a judge's instruction). |
| `text` | What the juror reads. |
| `surface_persuasion` | 0..1 — how convincing it *feels* in the moment. |
| `true_weight` | 0..1 — what it is *actually* worth to the truth. |
| `direction` | `guilt` or `innocence` — which way it pushes. |
| `reveal_stamp` | `decisive` \| `minor` \| `misleading`. |
| `reveal_note` | Shown at the reveal: what the beat was really worth, and why. |

## The design that makes it a game

The whole game is the gap between `surface_persuasion` and `true_weight`. A case
is only fun if that gap is real and fair. The gate enforces:

1. **A trap** — at least one `misleading` beat, and each one must
   `surface_persuasion − true_weight ≥ 0.25` (it feels more than it's worth).
2. **A real signal** — at least one `decisive` beat with `true_weight ≥ 0.6`.
3. **Both sides** — beats must argue both `guilt` and `innocence`.
4. **Solvable** — the `decisive` beats must, on balance, point to
   `verdict_truth` (guilt↔Guilty, innocence↔Not Guilty). The careful juror can
   get it right; only the hasty one is caught.
5. **Queue variety** — unique `id` / `publish_date` / `title`, and the queue is
   never all one verdict.

Good cases put the loud beat (`misleading`, high surface) early and the quiet
decisive beat later, so the first instinct is the wrong one.

## Two trap archetypes — alternate them

- **Feels guilty, is innocent.** Motive, a vivid witness, a scary defendant —
  then a decisive forensic/record beat exonerates. (`d-0001`, `d-0003`, `d-0004`.)
- **Feels innocent, is guilty.** A sympathetic defendant, an innocent-sounding
  excuse — then a decisive record convicts. (`d-0002`, `d-0005`.)

## Prompt template (for an LLM drafter)

> Write a fictional criminal-trial puzzle as JSON matching the SimJury case
> schema. It must be entirely invented — no real people, companies, or places;
> use roles and invented names. Charge: **{charge}**. Correct verdict:
> **{Guilty|Not Guilty}**. Trap archetype: **{feels-guilty-is-innocent |
> feels-innocent-is-guilty}**. Include 5 beats: one `misleading` beat with high
> `surface_persuasion` and low `true_weight` that points *away* from the true
> verdict; at least one `decisive` beat (`true_weight ≥ 0.6`) pointing *toward*
> it; and beats arguing both sides. Add a `twist` explaining why the obvious read
> is wrong. Set `label` to `"fiction"`.

Then hand-review, set `gen_meta`, and open a PR. The gate will reject anything
that misses rules 1–5.

## Review checklist (human, before merge)

- [ ] No real names of people/companies/places anywhere player-visible.
- [ ] The twist is fair — the decisive evidence really was there to be found.
- [ ] The trap is tempting — a hasty juror would plausibly be fooled.
- [ ] Reads cleanly in ~3 minutes; no filler beats.
- [ ] `gen_meta` records model, prompt_version, reviewer, batch_pr.
