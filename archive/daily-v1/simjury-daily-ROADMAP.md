# ROADMAP — SimJury Daily, phase by phase

**What this is:** the single source of truth for what gets built, coded, and rolled
out, in order. The [README](README.md) says what the product is; this file says what
happens next. Companion content spec: [docs/CASE-DOCKET-30.md](docs/CASE-DOCKET-30.md)
(the first 30 days of cases).

**The rules that outrank this file** (recap; they bind every phase):

1. **Fiction only.** Daily cases are fiction built from real trial patterns and say so.
   The `label: "fiction"` pin in [src/lib/caseSchema.ts](src/lib/caseSchema.ts) is a
   safety invariant, never a formality. Real historical cases ship only through the
   pilot repo's human-cleared harness — never through this pipeline.
2. **Static only, free tier.** No backend, no server, no billable Cloudflare feature.
   Re-read [docs/COST-GUARDRAILS.md](docs/COST-GUARDRAILS.md) before touching hosting.
3. **Every change is a PR** with CI green (lint · typecheck · test · validate:cases ·
   build). Content lands as case-JSON PRs a named human has actually read.

---

## Where we are (shipped)

| Phase | What shipped | Where |
|-------|--------------|-------|
| **M0** ✅ | Scaffold, CI, zod case schema with fiction pin, Wordle-style date→case selector | `src/lib/daily.ts`, `caseSchema.ts`, `.github/workflows/ci.yml` |
| **M1** ✅ | Full playable loop: intro → beats → verdict → reveal → spoiler-safe share; one play/day in localStorage; seed case `d-0001` | `src/App.tsx`, `src/components/*`, `src/lib/game.ts`, `share.ts`, `storage.ts` |

Not yet live: the site has never been deployed. That is deliberate — see rollout order.

## Rollout order at a glance

```
M3a  Content foundation   →  L  Launch  →  M2  Retention  →  M3b  Content cadence
                                                          →  M4   Funnel
                                                          →  M5   Durability & polish
```

Rationale: **content before launch** (a daily game with one case repeats itself on
day 2 — `caseIndexForDate` wraps the queue); **retention before promotion** (don't
pour traffic into a loop with no reason to return); **funnel after both** (there's no
point converting players before the daily habit exists).

---

## M3a — Content foundation *(code + content)*

**Goal:** a 30-day case queue and a validator that makes queue-health failures
impossible to merge.

### Code

1. **Validator hardening** — `scripts/validate-cases.ts` (+ unit tests):
   - unique `id`s; unique `publish_date`s; dates contiguous from the epoch (no gaps);
   - per case: ≥ 1 `misleading` beat, ≥ 1 `decisive` beat, both `direction`s present,
     `difficulty_target` within [0.30, 0.80];
   - queue-level: any rolling 7 days contain 2–5 `Guilty` truths; no run of more than
     3 identical verdicts (anti-meta — see docket §Design system);
   - **banned-token scan**: case JSON must not contain any name from a curated
     real-person list (seeded from the docket's pattern citations, e.g. "Beck",
     "Tichborne"). Fiction must stay fiction all the way down. This is the daily-repo
     analogue of the pilot's F-4 rule.
2. **Runway gate** — `scripts/check-runway.ts` + CI step: **fail** if
   `max(publish_date) − today < 14 days`; **warn** at < 21. The queue must never wrap
   in production.

### Content

3. **Author the docket** — [docs/CASE-DOCKET-30.md](docs/CASE-DOCKET-30.md) is the
   spec: 30 cases, verdict mix 16 G / 14 NG, four trap shapes, weekly difficulty
   rhythm, era/charge variety.
4. **Batch PRs** — six PRs of ~5 cases each (`d-0002…d-0006`, `d-0007…d-0011`, …,
   `d-0027…d-0030`). Every case is read by a human before merge; `gen_meta` names the
   reviewer and batch PR. The docket is the design; the JSON is the deliverable.

**Exit gate:** `npm run validate:cases` green with 30 cases; every case has a named
human reviewer in `gen_meta`; runway check passes at 30 days.

---

## L — Launch *(code + operator)*

**Goal:** the site is live at a real domain and a stranger can play today's case on
a phone.

### Code (one small PR)

- **Re-baseline the epoch** — `DAILY_EPOCH` in [src/lib/daily.ts](src/lib/daily.ts)
  is `2026-01-01`; selection is `dayIndex % queueLength`, so launching without
  re-baselining starts players mid-queue (as of July 2026 it would open on case #11).
  Set `DAILY_EPOCH` to the chosen launch date and re-anchor all 30 `publish_date`s to
  `epoch … epoch+29` in the same PR (mechanical; validator enforces contiguity).
- **Production share URL** — resolve the `TODO(launch)` in
  [src/lib/share.ts](src/lib/share.ts) (`SHARE_URL`) to the real domain.
- **`index.html` head** — title, meta description, OG/Twitter card tags with a
  **static, spoiler-safe** OG image (scales/gavel; never case content), favicon,
  `theme-color`.
- **Cloudflare Web Analytics beacon** — free, cookieless, explicitly sanctioned by
  COST-GUARDRAILS for M0–M4. One `<script>` tag; no cookies, no consent banner needed.

### Operator (dashboard, no code)

- Cloudflare Pages: connect this repo; build `npm run build`, output `dist/`; builds
  on push to `main` only. **Do not add a payment method** (COST-GUARDRAILS).
- Custom domain + SSL (the domain `SHARE_URL` points at).
- Branch protection on `main`: require CI + one review.
- Finish the Codex review wiring if not done (README §Bot reviews).

**Exit gate:** today's case plays end-to-end on a physical phone at the production
URL; the share text's link resolves; analytics registers the visit.

---

## M2 — Retention: streaks & calibration *(code)*

**Goal:** a reason to come back tomorrow. Entirely client-side — no accounts, no
backend, nothing leaves the device.

- **Profile record** — extend [src/lib/storage.ts](src/lib/storage.ts) with a
  versioned `simjury-daily:v1:profile` entry:
  `{ lastPlayedDay, currentStreak, maxStreak, played, correct, trapsSeen,
  trapsDodged, brierSum }`, updated once at verdict lock. Per-day play records stay
  as they are.
- **`src/lib/stats.ts`** (new, pure, fully unit-tested):
  - streak rules: consecutive `dayIndex` values extend; a missed day resets (honest
    streaks, no grace tokens);
  - **calibration score**: Brier score of the final conviction slider
    (`value/100` as p(Guilty)) against the truth (1/0), kept as a rolling mean, with
    bands for the reveal screen (e.g. < 0.20 "calibrated juror").
- **RevealView stats strip** — streak 🔥, correct record, lifetime traps dodged,
  calibration band.
- **Share card v2** — [src/lib/share.ts](src/lib/share.ts) appends a streak line when
  ≥ 2 (`🔥 12-day streak`). Still spoiler-safe by construction: no verdict, no case
  content.

**Exit gate:** streak survives refresh and day rollover (unit tests cover missed-day
and timezone-midnight cases); zero new network calls.

---

## M3b — Content cadence *(ops + small code)*

**Goal:** the queue never runs dry, at ≤ $15/week (the one variable cost —
COST-GUARDRAILS).

- **Weekly batch rhythm:** one PR of 7 cases per week. LLM-drafted from a prompt pack
  (`docs/PROMPT-PACK.md` — the docket's design system distilled into a generation
  prompt), then **edited and approved by a human, case by case**. `gen_meta` records
  model + `prompt_version` + reviewer, so provenance is queryable forever.
- **Docket v2** authored when the runway warning (< 21 days) first fires: same design
  system, fresh patterns, rebalanced shape mix informed by which shapes players talk
  about.
- **Monthly anti-meta audit:** verdict mix, twist rate (≤ ~60%), trap-shape
  distribution, difficulty rhythm — all against docket §Design system.

**Exit gate:** two consecutive weekly batches merged on schedule with runway never
dipping below 14 days.

---

## M4 — Funnel to the deep game *(code + operator)*

**Goal:** convert daily players into pilot-app jurors (the whole reason this repo
exists — see `../simjury/GROWTH.md`).

- **Cross-promo card on the reveal screen only** — never during play. Copy in the
  spirit of: *"Today's case was fiction. The real thing exists: a full jury sim built
  from an actual Victorian trial record."* One link to the pilot install page /
  itch.io. No tracking parameters (the pilot's no-analytics ethos).
- **Jury Room** — enable GitHub Discussions on this repo; one thread per week
  ("Daily cases #8–14"); footer link from the site. Spoiler etiquette in the thread
  template (`<details>` blocks past the share card).
- **README as landing page** — screenshots, the pitch line, install QR for the pilot.
- **Analytics decision point** — stay on Cloudflare Web Analytics vs upgrade to
  Plausible (~$9/mo). COST-GUARDRAILS says decide **here**, not before.

**Exit gate:** cross-promo live; first observed daily→pilot conversion (a verdict
card from a stranger, or a release-download bump correlated with a daily spike).

---

## M5 — Durability & polish *(code, deliberately last)*

- **Archive mode** — after today's verdict locks, past days become playable (never
  future days; one-play-per-day holds for the current day).
- **PWA** — manifest + service worker so today's case survives a tunnel. Static,
  free, no new hosting features.
- **Accessibility pass** — conviction slider keyboard/screen-reader support,
  contrast, reduced-motion.
- **Accepted risk, recorded:** the whole queue ships in the JS bundle, so future
  cases are dataminable. Same trade Wordle made; obfuscation isn't worth the
  complexity. Spoiling yourself is self-inflicted.

---

## Measurement (no heavy analytics)

- Cloudflare Web Analytics: visits, referrers, country mix.
- Share-card sightings in the wild; Jury Room thread activity.
- Pilot-side conversion: release download counts
  (`gh api repos/yanniedog/simjury/releases --jq '.[].assets[] | {name, download_count}'`).
- **Milestones:** sustained 100 plays/day → take the M4 analytics decision; queue
  runway warning fires → docket v2 becomes the top priority.

## Standing guardrails (every phase)

- The fiction pin is load-bearing. No PR relaxes it, ever.
- Static only; no Cloudflare feature beyond Pages + Web Analytics without a written
  decision in COST-GUARDRAILS.
- Growth/feature PRs never edit case content; content PRs never edit game logic.
- Real historical cases (the Beck line of work) live in the pilot repo, behind its
  harness, with its validator. This repo never imports pilot case text.
