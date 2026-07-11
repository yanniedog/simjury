# Web player decisions (simjury.com)

The web player at **simjury.com/play** is a **separate surface** from the Android pilot.
Some pilot/v3 decisions were written for the Android reading-game and do **not** bind the
web. This file records where the web deliberately diverges, and why. (Android/pilot rules
are unchanged; see `PILOT-SPEC.md`, `archive/simjury-build-spec-v3.md`.)

## D-WEB-1 — Audio narration (overrides v3 §25 LP-1 for web only)

- **v3 LP-1** says the app ships zero sound and is a silent reading game.
- **Web decision (owner-directed, 2026-07-11):** the web player is **listenable, like a
  podcast**. Narration uses the browser **Web Speech API** (`speechSynthesis`) — fully
  client-side, **$0**, no audio assets, no backend. Testimony auto-advances; the player can
  play / pause / skip, or turn narration off and read.
- Cost guarantee is preserved (no runtime/backend cost). Voice quality is device-dependent;
  a future upgrade path is pre-generated neural audio (not chosen now).

## D-WEB-2 — Listenable "jury room" (lite) (overrides GROWTH.md G-B / M-5 for web only)

- **GROWTH.md G-B / M-5** say jury seats stay **honestly empty** and AI/synthetic jurors are
  deferred to Phase 5 / G-5. That still holds for the **Android** app and its jury bench.
- **Web decision (owner-directed, 2026-07-11):** the web player adds a **scripted, listenable
  jury room** — 11 **fictional** jurors (allowed: v3 PS-4 makes jurors fictional) who voice a
  short deliberation the player *hears*, then the room reaches its **own** verdict. This is a
  reduced form of v3 §7.7/§9, **not** the full deterministic engine or process scoring.
- The player's own verdict is **locked before** the room deliberates, so the room never hints
  or anchors (preserves P-6/P-7). Juror lines reason only from the trial evidence and contain
  **no reveal content and no F-4 banned tokens** (spoiler-safe by construction).
- Content lives in `site/content/cases/<id>/jury_room.json` (web-owned, committed) and is
  synced into the player alongside the pilot case assets. It is intentionally distinct from a
  future full-v3 `jurors.json` (Phase 5, ≥40 authored lines + reaction rules per juror).

## D-WEB-3 — Court-sketch art layer (owner-directed, 2026-07-11)

- The whole site gets **court-sketch-artist visuals**, all in **first person** from
  Juror #1's seat (the site opens on the juror's-eye view of the full courtroom), with
  **HTML speech bubbles** overlaid while a character's narration plays — bubbles are
  never baked into the images.
- Final artwork is produced by an **external image-generation model**. The contract is
  [`site/art/IMAGE-BRIEF.md`](art/IMAGE-BRIEF.md) + [`site/art/image-manifest.json`](art/image-manifest.json)
  (style bible, cast sheet, per-image briefs, exact filenames, quiet zones for bubbles);
  [`site/art/prompts/`](art/prompts/) holds the compiled hand-off — a primer plus one
  self-contained prompt file per image, fed to the generator one at a time.
  Hand-drawn SVGs in `public/art/` are temporary placeholders until generated files land.
- Images contain **no legible text** (F-4 safety) and no real person's likeness.

## Unchanged, still binding on the web

- **No real names / no reveal content pre-verdict (F-4 / P-5).** Enforced for juror text by a
  build-time banned-token scan in `scripts/sync-cases.mjs`.
- **Zero backend / no accounts / no tracking.** The player is static assets only.
- **The reveal is the twist** (GROWTH §8 spoiler policy) — public copy names no defendant,
  year, court, or outcome.
