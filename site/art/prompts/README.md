# Feeding these prompts to ChatGPT

1. Open ONE new ChatGPT thread (image generation enabled).
2. Paste `00-primer.md` in full. Wait for it to acknowledge.
3. Paste the files below one at a time, in order — one message per file, each below
   its `---` line. Save each returned image under the SAVE AS filename (extension can
   differ; the name stem is what matters).
4. Drop finished files into `site/public/art/` — the site references those exact names
   (see `../image-manifest.json`, the source of truth these prompts are generated from).

Do image 01 (cast sheet) first and iterate on it until the style and characters look
right — every later image inherits from it. P0 = needed first, P2 = polish.

These files are generated: edit `../image-manifest.json`, then run
`node site/art/gen-prompts.mjs` from the repo root — do not edit prompts by hand.

| # | Prompt file | Save as | Priority |
| --- | --- | --- | --- |
| 1 | `01-cast-sheet.md` | `cast-sheet.webp` | P0 |
| 2 | `02-courtroom.md` | `courtroom.webp` | P0 |
| 3 | `03-og-card.md` | `og-card.webp` | P0 |
| 4 | `04-summons-usher.md` | `summons-usher.webp` | P1 |
| 5 | `05-witness-stand.md` | `witness-stand.webp` | P0 |
| 6 | `06-witness-w01.md` | `witness-w01.webp` | P1 |
| 7 | `07-witness-w02.md` | `witness-w02.webp` | P1 |
| 8 | `08-witness-w03.md` | `witness-w03.webp` | P1 |
| 9 | `09-witness-w04.md` | `witness-w04.webp` | P1 |
| 10 | `10-witness-inspector.md` | `witness-inspector.webp` | P1 |
| 11 | `11-witness-expert.md` | `witness-expert.webp` | P1 |
| 12 | `12-witness-constable.md` | `witness-constable.webp` | P1 |
| 13 | `13-accused-dock.md` | `accused-dock.webp` | P1 |
| 14 | `14-judge-direction.md` | `judge-direction.webp` | P1 |
| 15 | `15-exhibit-presented.md` | `exhibit-presented.webp` | P1 |
| 16 | `16-counsel-crown.md` | `counsel-crown.webp` | P2 |
| 17 | `17-counsel-defence.md` | `counsel-defence.webp` | P2 |
| 18 | `18-ep-01-method.md` | `ep-01-method.webp` | P1 |
| 19 | `19-ep-02-accounts.md` | `ep-02-accounts.webp` | P1 |
| 20 | `20-ep-03-documents.md` | `ep-03-documents.webp` | P1 |
| 21 | `21-ep-04-accused.md` | `ep-04-accused.webp` | P1 |
| 22 | `22-verdict-hands.md` | `verdict-hands.webp` | P1 |
| 23 | `23-jury-room.md` | `jury-room.webp` | P0 |
| 24 | `24-juror-02.md` | `juror-02.webp` | P2 |
| 25 | `25-juror-03.md` | `juror-03.webp` | P2 |
| 26 | `26-juror-04.md` | `juror-04.webp` | P2 |
| 27 | `27-juror-05.md` | `juror-05.webp` | P2 |
| 28 | `28-juror-06.md` | `juror-06.webp` | P2 |
| 29 | `29-juror-07.md` | `juror-07.webp` | P2 |
| 30 | `30-juror-08.md` | `juror-08.webp` | P2 |
| 31 | `31-juror-09.md` | `juror-09.webp` | P2 |
| 32 | `32-juror-10.md` | `juror-10.webp` | P2 |
| 33 | `33-juror-11.md` | `juror-11.webp` | P2 |
| 34 | `34-juror-12.md` | `juror-12.webp` | P2 |
| 35 | `35-sealed-record.md` | `sealed-record.webp` | P0 |
| 36 | `36-court-empty.md` | `court-empty.webp` | P2 |
| 37 | `37-install-spot.md` | `install-spot.webp` | P2 |
| 38 | `38-backdrop-panelling.md` | `backdrop-panelling.webp` | P2 |
| 39 | `39-foreground-rail.md` | `foreground-rail.png` | P2 |
