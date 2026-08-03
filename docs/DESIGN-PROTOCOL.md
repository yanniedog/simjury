# Design protocol — the binding Court Week interface rules

These rules bind `site/app/` and the landing page. They turn the player into a
juror inside an unfolding hearing rather than a reader advancing cards. A
feature that breaks one is a regression.

## 1. The stage is the product

The courtroom fills the available viewport. Use `100dvh` with `100svh` and
fixed-position fallbacks plus `env(safe-area-inset-*)`. Persistent gameplay text
is limited to speaker, court day/procedural phase, compact controls and optional
captions. The juror desk is hidden until requested.

Native fullscreen is optional. Rejection or Escape must leave a complete CSS
fullscreen experience and must not alter audio position, scene or legal state.

## 2. One responsive composition is not three stretched crops

Important scenes supply portrait-phone, 4:3-tablet and 16:9-desktop artwork via
`<picture>`, `srcset` and `sizes`. Every scene records a focal point and
subject-, evidence- and caption-safe regions.

- A crop may never remove a face, exhibit label or legally material detail.
- The evidence viewer is an opaque device-sized surface with button-operated
  zoom, reset and pan. Pinch/pan is optional, never required.
- No fact exists only in imagery, colour or sound.
- Failed art falls back to a neutral built-in courtroom surface while audio and
  state continue.

## 3. Controls survive every device

Controls reflow with container queries, not device detection:

- phone portrait: bottom safe-area strip and full-screen desk sheet;
- phone landscape: compact side controls outside the focal/caption regions;
- tablet: optional 38–42% side sheet in either orientation or split-screen;
- desktop: centred controls and a juror-desk overlay no wider than 420px.

At 200% zoom controls may wrap into an accessible menu, but no action or legal
content disappears and no horizontal page scrolling is introduced. Targets are
at least 44×44 CSS pixels. Hover, dragging, precision gestures and orientation
lock are prohibited as requirements.

## 4. Audio leads; captions and reading are complete alternatives

“Take your seat” primes narration, ambience and optional fullscreen. Only the
next unlocked scene is preloaded. Hiding the tab, interruption, rotation,
resizing and changing output devices pause safely; resume starts at the last
incomplete caption cue boundary.

- Audio-first may hide captions; Audio + captions remembers them; Reading mode
  is always available.
- Captions use at most two opaque lines in authored safe zones. If enlarged text
  cannot fit, the view expands to reading mode rather than clipping.
- Visible captions render once. A separate polite live region supplies the same
  cue to assistive technology without duplicate speech.
- One failed fetch retries once, then offers device speech with captions; if no
  voice works, reading mode opens automatically.

## 5. The juror's desk is functional memory

The desk holds the charge and alternative, element question trail, admitted
exhibits, judicial rulings and limitations, schedule and private notes. Oral
testimony is forward-only: no searchable transcript. Admitted recorded exhibits
may be replayed with a warning against giving them disproportionate weight.

Struck evidence is immediately removed from replay, desk, closings,
deliberation and analysis. Private notes that contain a struck fragment are
marked and excluded from deliberation selection without transmitting them.

## 6. Courtroom roles have a visible and audible grammar

Chief, cross and re-examination are distinguishable by counsel position,
speaker label and sound perspective, never colour alone. Objections interrupt at
their authored position; overruled and sustained rulings feel materially
different. Judicial directions and open-court returns use the bench composition.

Surfaces are opaque. Elevation is expressed through controlled lightness; the
near-black and brass palette remains. Crown/defence and verdict choices have
neutral shapes with printed labels and state attributes. Red/green is not a
semantic pair.

## 7. Deliberation is evidence-first and sealed

Speaking takes two required decisions: what legal question/evidence the player
points to, then how they reason with it. Direction, address and free text are
optional refinements. Free text stays private and is never sent for analysis.

The player's provisional ballot seals before the anonymous aggregate first
ballot. Seat-level positions never appear. A later majority direction does not
reuse the first ballot: further discussion and a fresh final ballot are
mandatory. No random tie-break or forced juror conversion is allowed.

## 8. Progress tells procedural truth

Progress is seven sessions plus the current legal phase, not a generic card
count. Advance controls name the procedural result—“Call the next witness” or
“Retire to consider the verdict”—rather than repeating “Next”. A locked session
states its Hobart unlock time without exposing future case content.

Rotation, viewport resize, split-screen and fullscreen changes must not restart
media or alter progress. Scene transitions, adjournments and ballots save
atomically; failed storage retains the current session in memory and offers an
export.

## 9. Accessibility and motion are release gates

Retain the skip link, visible 3px focus ring, semantic headings, focus movement
at major procedural transitions, keyboard access, `aria-current` for the live
speaker, reduced motion, forced-colour support and the 44px target floor.

Test from 320×568 to 2560×1440 in supported phone, tablet, split-screen and
desktop browsers at 100% and 200% zoom. Reduced motion uses static cuts; it does
not remove content. No autoplay, audio, image, fullscreen or storage capability
may be required to reach a lawful verdict.

## 10. Restraint remains binding

One string has one visual home. Typefaces are either self-hosted or removed from
the stack. Long reading-mode paragraphs are left-aligned and capped at 66ch.
Tokens are defined once. There are no leaderboards, streaks, feeds, attention
traps, countdowns or moral colouring of verdicts.
