# Design protocol — the binding interface rules

The Daily Docket's writing, case construction and palette are sound. What the
2026-08-02 design and UX audit found was an interface that keeps interrupting
them: persistent chrome above every phase, eleven authored jurors drawn as
numbered boxes, and the same string printed twice on one screen.

These are the rules that came out of that audit. They are binding on
`site/app/` and on the landing page. A change that breaks one of them is a
regression even when it ships a feature.

Each rule states the failure it exists to prevent, so it can be argued with on
evidence rather than taste.

## 1. The chrome budget

**Above the phase heading: the top bar, and nothing else.**

Anything rendered outside the phase switch is paid for on the briefing, the
openings, every evidence beat, the closings, the jury room and the record — six
phases and fourteen beats, for a twenty-minute sitting. The audit measured 460px
of such chrome on a 1440×950 desktop viewport, which put the case heading below
the fold in every phase.

- A panel that belongs to one phase renders in that phase.
- **An unavailable feature renders nothing.** Not a panel explaining the
  absence. The live-jury lobby, when the health check reports rooms closed, is
  absent — the solo route is the product, not a fallback being apologised for.
- Destructive controls (rewind, clear progress) live behind a menu and a
  confirm, never as a permanent banner in the first screenful.

## 2. The top bar does not wrap

Capped at **3.5rem on mobile, 4.5rem on desktop**, one row, always.

Four always-visible audio controls wrapped onto a second row at 390px and held
21% of the viewport permanently, on a screen whose job is reading. Secondary
controls — voice engine, speed, narration, room tone — belong in the popover
behind a single audio button.

## 3. Colour never carries meaning alone

- **No red/green pairing for status.** It is the pairing protanopes and
  deuteranopes cannot separate. Use amber/blue: thematically warm Crown against
  cool defence.
- Every colour signal has a redundant channel — a printed label, a mark, an
  `aria-pressed` state.
- **Verdict choices are three identical neutral surfaces.** Green for acquit and
  red for convict paints a moral valence onto a threshold the case asks the
  player to apply honestly, and contradicts the reveal's own statement that it
  offers "an editorial comparison, not an objectively correct answer".
  Selection is marked in brass, not by fill colour.

## 4. One string, one home

The same text is never printed twice on one screen.

- The speaker's name belongs on the card. The beat toolbar carries position and
  mode only.
- The charge belongs in the rail, where it stays visible for the whole sitting.
- **Narration off: the narrator cue renders nothing.** Narration is an
  alternative to reading the screen, not a duplicate of it. Narration on: a
  single-line caption tied to playback state, subordinate to the testimony it
  introduces.
- A cue never repeats text already visible elsewhere on the screen.

## 5. Surfaces are opaque, and elevation is lightness

Four surface tokens ascending from `#0d1113`. The gradient stays on the page
ground and never sits under a panel.

A translucent panel over a gradient has measurably different contrast depending
on where it lands, so its text contrast cannot be stated as a ratio at all.
Opaque tokens make contrast a fixed, checkable property of each pair. Pure black
is also avoided deliberately: shadows and elevation cannot read against it.

## 6. Tokens are declared once

One `tokens.css`, imported by both the app and the landing page. Palette
variables declared in two stylesheets agree only until someone edits one.

Four radii. One hairline colour. One motion set. Twelve distinct radius values
across an app is sprawl, not expression.

## 7. Typefaces are loaded or not named

A font stack names only faces that will actually render: either self-hosted from
`'self'` (which the strict CSP allows) or a deliberate system stack. Naming
`Inter` with no `@font-face` rule and no font file means the site renders in
Segoe UI, SF or Roboto depending on the platform, while the code claims
otherwise.

Typography: one alignment per block; any paragraph over two lines is
left-aligned; testimony sets to `max-width: 66ch`.

## 8. The jurors are people, not seats

The premise of the product is that you must persuade eleven distinct people.
They have authored personas, portraits, persuasion styles and their own notes.

- A seat shows **portrait, given name, and a glyph for persuasion style**.
- The speaking juror's seat lifts and rings in brass, and the transcript line is
  anchored to that seat.
- Clicking a seat opens that juror's dossier in place. The seat is the single
  juror object — not numbers on the bench, names in the transcript and
  characters in a panel behind a mode switch.
- **Leanings and tallies stay sealed until the judge reads the result.** This is
  a product rule and it outranks the rest of this section. Standing and
  attention describe approach, not position, so they may show.

## 9. Progress tells the truth

A progress indicator frozen for the longest stretch of the sitting is worse than
none: it actively suggests nothing is happening.

- Weight the bar by real work, not by phase count. Evidence is fourteen beats
  and roughly half of the twenty minutes; it is not one sixth.
- Each beat visibly lands, via a segmented indicator.
- **Advance controls name their outcome.** "Call the first witness", not the
  fourteenth "Next →".

## 10. The rail is the juror's desk

The charge, the elements the prosecution must prove, the evidence index, and
your notes — what a real juror keeps in front of them. Not one line of text and
a privacy notice held for twenty minutes.

The storage notice moves to the footer. On mobile the rail must not reflow to
put a privacy note below the primary button.

## 11. Two decisions to speak

The deliberation is why this is a product and not an article. Reaching send
takes at most two decisions: **what you are pointing at** (the recollection),
then **how you put it** (the technique).

Direction and address are optional refinements behind a disclosure with sensible
defaults. Free text is optional and never first. A five-field form at three
rounds per sitting costs more time than the deliberation it serves, and feels
like filing rather than speaking.

## What is already right, and stays

Recorded here so it is not traded away by a later change.

- The **accessibility groundwork**: a skip link, a 44px minimum target (well
  above the 24px WCAG 2.2 requires), a 3px focus ring, focus moved to the phase
  heading on every transition, `aria-current` on the speaking turn, and a global
  `prefers-reduced-motion` block.
- The **no-JavaScript fallback** in `index.html`, which describes the whole
  journey in readable prose.
- The **palette's character** — brass on near-black with warm paper ink. Rules 3
  and 5 adjust how it is applied; they do not replace it.
- The **restraint**: no leaderboards, no streaks, no feed.

## Grounding

- WCAG 2.2 — target size 2.5.8, focus not obscured 2.4.11, dragging movements
  2.5.7
- *A Practical Guide To Designing For Colorblind People*, Smashing Magazine
- *Optimal line length for readability*, UXPin — the 50–75 character band
- *Tips for dark theme design*, UX Planet — elevation by lightness, off-black
  grounds

Method behind the findings: a Playwright walkthrough of the full sitting at
1440×950 and 390×844 against `vite dev`, plus a read of the app source, both
stylesheets and the landing page. Case shown: Docket 0214, The Locked Floor.
