# The First 30 Days — case docket (`d-0001` … `d-0030`)

**What this is:** the design ledger for the first 30 daily cases — all of which now
exist in [`cases/`](../cases/) and pass `npm run validate:cases` (schema + the
design-quality gate in [`src/lib/caseQuality.ts`](../src/lib/caseQuality.ts)). It
records how the month is balanced and, per case, the real trial *pattern* the
fiction is built from. Authoring rules live in
[CASE-GENERATION.md](CASE-GENERATION.md); the rollout plan in
[../ROADMAP.md](../ROADMAP.md).

**Provenance rule (important):** the pattern citations below name real historical
phenomena and, where useful, real documented cases. Those names exist **only in this
document** as design provenance. They never appear in case JSON — nothing
play-reachable names a real person, company, or place. A future banned-token check
should be seeded from the names cited here. Every case is fiction and is labelled
fiction.

---

## Design system

### The four trap shapes

If every case were a twist, "always vote against your gut" would beat honest
reading. The month mixes four shapes:

| Shape | Surface read | Truth | Days | Job |
|-------|-------------|-------|------|-----|
| **T1 — Framed by the obvious** | Guilty | Not Guilty | 1, 3, 4, 6, 12, 14, 18, 19, 21, 23, 24, 29, 30 (13) | The genre's heart: vivid story, quiet exoneration |
| **T2 — Sympathetic culprit** | Not Guilty | Guilty | 2, 5, 7, 9, 13, 17, 25, 27, 28 (9) | Charm and character vs documents |
| **T3 — It is what it looks like** | Guilty | Guilty | 10, 11, 15, 16, 20, 22 (6) | Calibration: the obvious read is *right*; the trap is doubting solid evidence |
| **T4 — Rightly accused of nothing** | Not Guilty | Not Guilty | 8, 26 (2) | Calibration: trust the boring paper trail against a scary accusation |

Verdict mix: **15 Guilty / 15 Not Guilty**, longest same-verdict run 3. Twist rate
(T1+T2) is 22/30 ≈ 73% — a pure contrarian scores above chance on verdicts but takes
nearly every per-beat trap, which the trap-dodge score punishes. **Docket v2 should
add more T3/T4 days** (target ≤ 65% twist rate) now that the audience has learned
the twist is possible; the calibration days are what keep the game honest.

### Difficulty rhythm

Sunday features on days 7, 14, 21, 28 (`.65 / .70 / .75 / .75`), softer days after
each (day 8 `.35`, day 15 `.40`, day 22 `.45`), mid-week in the `.45–.60` band.

### The floor every case clears (CI-enforced)

4–6 beats · ≥ 1 misleading beat with `surface_persuasion − true_weight ≥ 0.25` ·
≥ 1 decisive beat with `true_weight ≥ 0.6` · both directions argued · decisive
beats on balance point at the true verdict · unique id/date/title · loud trap
early, quiet signal late.

---

## The queue, day by day

| Day | Case | Era | Charge | Truth | Shape | Diff | The lesson |
|----:|------|-----|--------|-------|-------|-----:|------------|
| 1 | The Emberline Bakery Fire | present | arson for insurance | NG | T1 | .60 | motive is not mechanism |
| 2 | The Short Till | present | employee theft | G | T2 | .60 | good character delays scrutiny; documents end it |
| 3 | Last Call | present | assault | NG | T1 | .55 | the angrier face isn't the aggressor |
| 4 | A Face You Don't Forget | present | burglary | NG | T1 | .65 | certainty ≠ accuracy |
| 5 | The Trusted Treasurer | present | charity fraud | G | T2 | .60 | trust is the cover, not the alibi |
| 6 | The Man Who Confessed Twice | present | armed robbery | NG | T1 | .60 | confessions can be manufactured |
| 7 | The Anchor and the Storm | 1870s sail | murder at sea | G | T2 | .65 | a forged record is a confession about the truth |
| 8 | The Sunday Painter | present | art fraud | NG | T4 | .35 | the boring paper trail beats the loud expert |
| 9 | The Nine-Minute Gap | present | death by dangerous driving | G | T2 | .50 | devices out-testify loyal households |
| 10 | The Choirmaster's Watch | 1920s | church burglary | G | T3 | .50 | junk evidence stays junk even when it's "right" |
| 11 | The Second Set of Books | 1920s | investment fraud | G | T3 | .45 | steady dividends can *be* the fraud |
| 12 | The Sleepwalker's Kitchen | present | wounding | NG | T1 | .60 | no conscious mind, no intent |
| 13 | The Hand of M. Corbin | 1890s | will forgery | G | T2 | .60 | when experts duel, date the ink |
| 14 | The Lighthouse Keepers | 1860s | murder | NG | T1 | .70 | macabre conduct isn't guilt |
| 15 | The Silver Hoof | 1900s | insurance slaughter | G | T3 | .40 | sometimes it's exactly what it looks like |
| 16 | The Turnstile Twin | present | robbery | G | T3 | .50 | conceivable doubt isn't reasonable doubt |
| 17 | The Salted Claim | 1870s | mine-share fraud | G | T2 | .50 | honest assays of dishonest rock |
| 18 | The Wrecker of Point Morrow | 1830s | wrecking by false lights | NG | T1 | .55 | a legend is not evidence |
| 19 | The False Alibi | present | burglary | NG | T1 | .55 | people lie out of shame, not only guilt |
| 20 | The Cellar Print | present | safebreaking | G | T3 | .60 | scepticism can be weaponised too |
| 21 | The Night Nurse | present | double murder | NG | T1 | .75 | the prosecutor's fallacy |
| 22 | The Miller's Measure | 1300s | theft by false measure | G | T3 | .45 | prejudice proves nothing — and excuses nothing |
| 23 | The Poison-Pen of Alder Lane | 1920s | criminal libel | NG | T1 | .50 | the accuser can be the author |
| 24 | The Bitter Tonic | 1850s | arsenic murder | NG | T1 | .55 | the victim's own habits explain the poison |
| 25 | The Vanishing Bridegroom | 1900s | marriage fraud | G | T2 | .55 | a pattern repeated is design |
| 26 | The Quarry Gate | present | manslaughter | NG | T4 | .55 | blame stops one rung too low |
| 27 | The Locked Gallery | present | jewel theft | G | T2 | .60 | the alarm-raiser writes the first story |
| 28 | The Man from the Sea | 1870s | perjury (impostor heir) | G | T2 | .75 | weigh what cannot be coached |
| 29 | The Borrowed Face | 1890s | serial fraud | NG | T1 | .50 | repeated error is not corroboration |
| 30 | The Gaslight Corridor | 1880s | murder | NG | T1 | .65 | a verdict is only as good as what reaches the court |

Eras: present ×13, Victorian/Edwardian ×10, 1920s–30s ×3, maritime/coastal ×2,
gold-rush ×1, medieval ×1. Charge families: homicide ×6, fraud ×8, theft/burglary ×7,
robbery ×2, assault/wounding ×2, driving/industrial ×2, arson ×1, libel ×1,
perjury ×1.

---

## Pattern provenance (design-doc only — never in case JSON)

Days 1–5 are the hand-authored seeds from the M1/M3 batches (generic patterns:
motive-without-method, trusted-insider theft, self-defence misread, confident
mistaken ID, fiduciary fraud). Days 6–30:

- **d-0006** — interrogation-driven false confessions: long custody, details fed by
  press coverage, account contradicted by the scene. Cf. the documented
  false-confession exonerations that reshaped interview rules.
- **d-0007** — falsified ship's logs in maritime inquiries; document examination of
  ink and hand-state to show entries written at one sitting.
- **d-0008** — restorer over-suspicion in art fraud: "modern pigment" findings
  resolved by documented conservation history.
- **d-0009** — vehicle telemetry (airbag/EDR modules) and paint-batch transfer
  defeating household alibis in hit-and-run prosecutions.
- **d-0010** — tracker-dog "evidence" as courtroom theatre (stale trails, handler
  cueing) — historically admitted, rightly distrusted; here it points at a man the
  documents convict anyway.
- **d-0011** — Ponzi mechanics: fabricated statements exposed by paper/watermark
  dating; redemptions paid from deposits. Cf. the great brokerage-statement frauds.
- **d-0012** — automatism: violence during documented parasomnia, with the medical
  history predating any motive. Cf. the landmark sleepwalking acquittals (R v Parks
  line).
- **d-0013** — the graphology wars of the belle époque: dueling handwriting experts
  settled by ink chemistry (dyes datable to post-death manufacture).
- **d-0014** — isolation plus macabre-but-innocent conduct: the keeper who preserved
  his colleague's body to forestall accusation. Cf. the Smalls Lighthouse ordeal of
  1801, which ended two-keeper postings.
- **d-0015** — insurance slaughter of bloodstock, a recurring documented racing
  scandal; the "intruder" story vs the dog that didn't bark.
- **d-0016** — the identical-twin defence as automatic reasonable doubt, defeated by
  placing the twin; "conceivable vs reasonable" doubt.
- **d-0017** — mine-salting: gold fired into a working face with a shotgun, honest
  assays of doctored rock. Cf. the great diamond hoax of 1872.
- **d-0018** — legend-driven prosecution: wrecking-by-false-lights is largely
  folklore; coastal communities plundered wrecks but luring is near-mythical.
- **d-0019** — the fabricated alibi that hides shame, not guilt — the scenario behind
  the *Lucas* direction on lies.
- **d-0020** — weaponised scepticism: genuine historical forensic failures (e.g.
  fingerprint misattributions) recited to fog a case where the forensics are sound.
- **d-0021** — shift-correlation prosecutions of nurses and the prosecutor's fallacy;
  clusters that vanish under acuity-adjusted rosters. Cf. the Lucia de Berk
  exoneration line.
- **d-0022** — weights-and-measures fraud, the oldest commercial crime; assize-era
  enforcement and the proverbial distrust of millers.
- **d-0023** — poison-pen prosecutions where the complainant was the author,
  exposed by marked-stamp postal stings. Cf. the Littlehampton letters of the 1920s.
- **d-0024** — arsenic-era poisoning trials upended by the victim's own dosing habit
  (tonic-taking) and pharmacy ledgers; hair-segment chronology.
- **d-0025** — Edwardian serial-courtship swindlers; selective "amnesia" failing
  standard malingering checks; verbatim-identical love letters.
- **d-0026** — industrial-disaster scapegoating: the man at the lever charged while
  written, ignored fault reports point up the ladder.
- **d-0027** — the investigator-as-thief and alarm-raiser bias; the "impossible
  crime" whose impossibility indicts the insider.
- **d-0028** — the great impostor claims: family recognition and coached childhood
  detail against what cannot be taught (a first language). Cf. the Tichborne
  claimant.
- **d-0029** — serial misidentification: multiple sincere victims, rigged
  identification parades, exoneration by the perpetrator's documented skills the
  accused lacked. Cf. the Adolf Beck case.
- **d-0030** — tunnel vision and suppressed exculpatory evidence: the first-night
  story choosing the evidence; disclosure failure as the miscarriage engine.

## Docket v2 (when the runway warning fires)

1. Rebalance shapes: more T3/T4 (twist rate ≤ 65%).
2. Fresh pattern families not yet used: cross-contamination in the lab,
  chain-of-custody breaks, gait/CCTV overreach, base-rate errors in DNA cold hits,
  duress, entrapment, mercy-motive homicide (handled soberly).
3. Rotate which weekday carries the calibration days — never let the rhythm become
  a tell.
4. Keep Sunday features as the "big pattern" slots: one statistics case, one
  document-forensics case, one impostor/identity case per month works well.
