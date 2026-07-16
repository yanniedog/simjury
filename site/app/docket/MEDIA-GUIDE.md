# Daily Docket media guide

Every published case should feel like a current human story, not an illustrated
worksheet. Create the media set only after the case is locked.

## Required set

1. `cover`: a contemporary court sketch from the juror's viewpoint. Establish
   the accused as a specific person without signalling innocence or guilt.
2. `accused`: a natural "before the case" portrait grounded in an authored life
   detail. Avoid sainthood, pity, glamour, or poverty shorthand.
3. Two or three selected `beats`: use evidence reconstructions only where the
   image changes how a juror understands the record. Include at least one image
   that gives the complainant or opposing witness equal humanity.

Do not illustrate every paragraph. Images should create presence, clarify
physical context, or make a person memorable.

## Visual language

- Court images: charcoal and ink with selective modern watercolour, visible
  paper grain, contemporary furniture and clothing. No wigs, gavels, sepia, or
  historical courtroom nostalgia.
- Human context: candid editorial photography with natural skin, ordinary
  clothing, real domestic or work texture, and unstaged expressions.
- Evidence: believable phone, security-camera, document, or scene imagery.
  Preserve ambiguity at the point when the jury encounters it.
- Generate the accused's identity anchor first. Use it as a reference for every
  later image of that character. Do the same for recurring witnesses.

## Trust rules

- All people and events are fictional. Never resemble a public figure.
- Captions must begin `Fictional court sketch`, `Fictional character portrait`,
  or `Fictional reconstruction`.
- Do not put invented readable names, dates, amounts, messages, or labels inside
  an evidence image. The authored case text is the record; the image supports it.
- No logos, watermarks, real companies, gore, police spectacle, villain coding,
  or sentimental manipulation.
- Write useful alt text that describes what the juror can see without revealing
  later evidence.

## Delivery

- Landscape, crop-safe at phone width; 3:2 for people, 16:9 for evidence.
- Export WebP at up to 1280 px on the long edge. Aim below 250 KB per asset.
- Store source assets in `site/app/public/media/<case-id>/`; Vite publishes
  them at `/today/media/<case-id>/`. Declare that public URL in the case's
  `media` block. Media beat keys must resolve to real beat ids.
- Check the full case at 390 px before merge. A lazy-loaded image may need a
  moment in view before visual QA captures it.

Voice is opt-in. The web fallback prioritises voices advertised by the device as
Natural, Neural, Premium, or Enhanced and uses restrained pitch and pace. Future
authored audio may replace the fallback, but it must preserve the same fictional
speaker identities and never imply that a real person recorded the case.
