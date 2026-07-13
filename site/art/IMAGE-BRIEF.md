# SimJury art brief — request to the image-generation model

You are being asked to produce the complete illustration set for **simjury.com**, a
browser game in which the player sits as **Juror #1** on a real 1890s English criminal
trial. The machine-readable job list is [`image-manifest.json`](image-manifest.json)
(same folder). This document is the contract; the manifest is the queue.

## The one-sentence brief

Draw everything **as a court sketch artist would**, and draw everything **through
Juror #1's own eyes**.

> **Hand-off note:** to generate the images one at a time in a ChatGPT thread, use
> [`prompts/`](prompts/) — a primer (`00-primer.md`, paste first) plus one numbered,
> self-contained prompt file per image with its exact save-as filename. The prompts
> are generated from the manifest; edit the manifest, then regenerate.

## Hard rules (a violation fails the image, no exceptions)

1. **First person, always.** Every image is exactly what Juror #1 sees: seated
   eye-level from the jury box, or from their chair at the jury-room table, or looking
   down at their own hands. The viewer's own hands/forearms may appear where the
   manifest entry says so; the viewer's face or body never appears. Characters who
   address the jury look **into the camera** — at the player.
2. **No text.** No letters, numerals, signatures, watermarks, or legible writing
   anywhere — documents in shot show only illegible scribble strokes. This is a
   content-safety rule (the game conceals real historical names until the reveal), not
   just a style preference.
3. **No speech bubbles in the image.** The site overlays live HTML speech bubbles on
   top of these images while a character is speaking. Each manifest entry declares a
   `quiet_zone` — keep that region compositionally calm (plain wash, panelling, sky)
   so the bubble sits legibly there.
4. **No real person's likeness.** Faces are court-sketch faces: a few confident
   strokes, types not portraits.
5. **Era-correct.** 1890s English criminal court. Gas light, oak, wigs and gowns.
   **No gavel** (English courts have none), no microphones, no modern anything.

## Style bible

Prepend `style.base_prompt` from the manifest to every image. In short:

- **Medium:** pastel + charcoal/conté on warm **buff toned paper** — the classic
  courtroom-artist look. Rapid, confident reportage linework in dark sepia.
- **Colour:** muted washes laid loosely so pigment **drifts outside the outlines**;
  cross-hatched shadows; large areas of raw paper left showing, especially at the
  margins (unfinished edges are part of the look).
- **Palette:** sepia ink, buff paper, oxblood red (judge's robe, legal tape), brass
  gold (lamps, rails), slate green (baize, shadows), faded navy, chalk white (wigs).
- **Light:** warm gas-lamp amber against cold grey window daylight. This contrast is
  the mood of the whole set.
- **Not:** photorealism, 3D, anime, caricature, clean vector art, visible frames.

Use `style.avoid` from the manifest as the negative prompt on every generation.

## Cast consistency

Thirteen recurring characters are defined in `cast` in the manifest (judge, two
counsel, usher, the accused, four women complainants, three male witnesses, the
foreperson, plus generic jurors). **Generate `cast-sheet.webp` first** and use it as
the visual reference (reference image / consistent seed / character LoRA — whatever
your tooling supports) for every subsequent image. The four complainants especially
must be instantly tellable apart (mourning black / russet + fur / grey-blue + pince-nez
/ green + feathered hat).

## Workflow

1. Generate **cast-sheet** (P0, not deployed). Iterate until the style and cast are right —
   everything else inherits from it.
2. Generate the **P0** images: `courtroom.webp` (the site's opening image — spend the
   most effort here), `og-card.webp`, `witness-stand.webp`, `jury-room.webp`,
   `sealed-record.webp`.
3. Generate **P1** (per-speaker scenes, episodes, judge, verdict), then **P2**
   (per-juror portraits, counsel, dressing).
4. Self-QA every image against the checklist below before delivery.

### QA checklist (per image)

- [ ] Reads as a hand-drawn court sketch on buff paper (not a painting, not a photo)
- [ ] Camera = Juror #1's eyes; jury rail / own hands only as specified
- [ ] `quiet_zone` region is calm enough to hold a text bubble
- [ ] Zero legible text anywhere (zoom in on papers, charts, spines)
- [ ] No gavel, no anachronisms
- [ ] Recurring characters match the cast sheet
- [ ] Correct pixel size and aspect from the manifest entry
- [ ] Exact filename from the manifest (the site references paths verbatim)

## Delivery

- Drop files into **`site/public/art/`** with the exact manifest filenames.
- WebP (~quality 82, sRGB); `foreground-rail.png` is the one alpha PNG.
- The placeholder `.svg` files currently in that folder are stand-ins; the site's
  references get flipped to the new files at integration (see
  `delivery.integration_points` in the manifest: `play.js` SCENES map,
  `styles.css` atmosphere, `index.html` hero/og).

## Coverage map (why each image exists)

| Site surface | State | Image id |
| --- | --- | --- |
| Landing hero — **the site opens on this** | index.html | `courtroom-pov` |
| Social share card | og:image | `og-card` |
| Site-wide page backdrop (heavily darkened) | all pages | `backdrop-panelling` |
| Viewport-bottom foreground (rail + neighbours) | landing, summons | `foreground-rail` |
| Play: summons ("take your seat") | play:summons | `summons-usher` (until then: `courtroom-pov`) |
| Play: episode intros 1–4 | play:reading episode head | `ep-01-method` … `ep-04-accused` |
| Play: testimony — Mrs Elling / Garner / Holt / Irwin | speaker P-01…P-04 | `witness-w01` … `witness-w04` |
| Play: testimony — Inspector Vale / Mr Penrose / Mr Quill | speaker P-05…P-07 | `witness-inspector`, `witness-expert`, `witness-constable` |
| Play: the accused speaks | speaker P-08 | `accused-dock` |
| Play: judge's directions | voiceKey judge | `judge-direction` |
| Play: exhibits (scene behind the document render) | exhibit items | `exhibit-presented` |
| Play: Crown / defence claim bubbles on exhibits | exhibit claims | `counsel-crown`, `counsel-defence` |
| Play: generic testimony fallback | any block w/o specific art | `witness-stand` |
| Play: verdict ("lock it") | play:verdict | `verdict-hands` |
| Play: jury room wide | play:juryroom | `jury-room` |
| Play: jury room — each speaking juror (seats 2–12) | beat speaker J-01…J-11 | `juror-seat-02` … `juror-seat-12` |
| Play: the reveal | play:reveal | `sealed-record` |
| 404 page + "court could not convene" error | 404.html, error card | `court-empty` |
| Install page header | install/index.html | `install-spot` |

Speech bubbles: the site renders a bubble (speaker name + their words, first person)
over the image's quiet zone whenever that character's narration is playing. Your only
job regarding bubbles is to leave them room and never draw them.
