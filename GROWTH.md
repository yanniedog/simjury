# GROWTH.md — Cold-start engagement & the first 100 jurors

**Status:** living playbook. Owner-directed growth track opened during Phase 4; it runs
*parallel to* case authoring and never blocks or touches G-4 work.

**Scope guard (non-negotiable):** nothing in this playbook may violate the pilot
constraints — fully offline trial play (P-1), no runtime AI (P-2), no backend, no
accounts, no in-app analytics, and nothing that can leave the app may contain real
names or the historical outcome (F-4 spirit). Growth features ride the same PR
discipline as everything else: one concern, ≤ 400 lines, squash merge, bot gates.

---

## 1. The engine: why SimJury works with zero other users

SimJury's opponent is **history, not other players**. The core loop — read a real
(renamed) trial, commit a private diary, lock a verdict, then learn what actually
happened — is already complete as a solo experience. The reveal lands hardest when the
player faces it alone: the historical jury had the same evidence and less patience.

So the cold-start strategy is **not** to fake liveliness. No bots posing as jurors, no
fake counters, no dark-pattern streaks. Instead:

1. Make the solo payoff **legible to outsiders** — the verdict card (§3, M-1).
2. Turn the visibly empty jury box into the game's own recruitment loop — the jury
   bench + juror codes (§3, M-2).
3. Move real deliberation to places that already contain people — jury nights,
   classrooms, and one pinned discussion thread (§3, M-3/M-4).

The first hundred users are not an audience to acquire; they are **eleven empty seats,
nine times over**.

## 2. Design principles for the empty-courtroom era

| ID | Principle | Consequence |
|----|-----------|-------------|
| G-A | The opponent is history | Solo play must never feel like waiting for other players |
| G-B | Honest emptiness | Empty seats are shown as an invitation — never filled with fake jurors |
| G-C | Spoiler-safe by construction | Anything designed to leave the app (cards, codes, posts) carries no real names, no year, no historical outcome |
| G-D | Zero backend | Social features work phone-to-phone (short text codes) or on GitHub infrastructure we already ship from |
| G-E | Deliberation is the product | The best SimJury with < 12 users is five friends arguing in a kitchen. Build for the room, not the server |

## 3. Mechanics ladder (cheapest first)

### M-1 — Verdict card *(in app)*

After the verdict locks, the reveal screen offers **Share your verdict card**: a short,
plain-text, Wordle-style card sent through the Android share sheet. It contains only
play-safe fields — play title, charge, the player's own verdict, evidence count — plus
an install link. Never the reveal, never restored names, never whether the player
matched the historical jury (that would leak the outcome).

Every finished playthrough becomes an invitation, and the card is safe to post
anywhere because spoiling is *structurally impossible*.

### M-2 — The jury bench + juror codes *(in app)*

The reveal screen shows **twelve seats**. Seat 1 is the player and their verdict. The
other eleven start empty — honestly empty (G-B), labelled as awaiting jurors.

When a player's verdict locks, the app mints a short **juror code** (e.g.
`SJ1-C001-NG-4XK-Q`) encoding case, verdict, and diary leaning. Codes travel by any
messaging app; no network, no server. Entering a friend's code seats them on your
bench with their verdict — and codes can only be redeemed **after your own verdict is
locked**, which protects both P-7 (no hints during play) and the surprise.

Filling the bench *is* the meta-game: recruiting a juror and playing the game become
the same action. Two phones in a pub is a functioning two-person jury room.

### M-3 — The Jury Room *(GitHub Discussions — operator setup, no code)*

One pinned Discussion per case (e.g. **"Jury Room — Case C-001"**). Players paste
their verdict card and argue below it, with anything past the card wrapped in
`<details>Spoilers — locked verdicts only</details>`. The operator edits a running
tally into the thread header (e.g. *"14 verdicts: 9 G / 5 NG"*) — a community counter
with zero backend. The install page and README link to it.

### M-4 — Jury Night host kit *(§5 — one host = 5–30 users)*

### M-5 — Deferred (do not build yet)

- **Aggregate verdict tally in-app**, piggybacked on the update manifest
  (`app-apk-latest.json`). P-1 gray zone — needs an explicit owner decision first.
- **Share card PNG** — explicitly Phase 5 (`PILOT-SPEC.md` §7).
- **AI jurors / deliberation engine** — Phase 5, gate G-5. Empty seats stay empty
  until real people or G-5 fills them.
- **Play Store / F-Droid listing** — Phase 6, but see friction audit (§7).

## 4. The first 100 jurors — channel plan

Definition: a **juror** is someone who locked a verdict. Proxies, in order of trust:
jury-night headcounts → juror codes redeemed → release download counts (§6).

### Tier 1 — hand-to-hand (jurors 1–25)

- **Two or three hosted jury nights** (§5): friends, family, colleagues. 5–8 jurors
  each. The host experience is the product demo *and* the retention loop.
- **One classroom or law-student pilot.** A single legal-studies teacher, law-school
  society, or debate club is 20–30 jurors in one hour, plus a real deliberation — the
  offline, no-account, no-tracking design is precisely what schools need. Ask: one
  session, one page of feedback.
- **The single ask** that closes every conversation: *"Play to the reveal, then send
  me your verdict card."* The card is the confirmation of a completed playthrough.

### Tier 2 — communities (jurors 25–70)

Story-first, link-second; every community post uses the spoiler-safe pitch (§8) and
respects local self-promotion rules (read each subreddit's rules before posting).

- **Show HN** — the honest engineering angle: *"A fully offline jury sim built from a
  real Victorian trial record, with a validator that bans real names pre-reveal."*
- **Interactive fiction community** (intfiction.org forum) — this is their genre.
- **Reddit**, in order of fit: r/AndroidGaming, r/WebGames-adjacent IF subs,
  r/TrueCrime / r/UnresolvedMysteries (mind rule constraints), r/historyteachers.
- **Legal-history / true-crime podcasts and newsletters** — small ones answer email.
  Offer the reveal as the story; ask only for a link in show notes.

### Tier 3 — durable trickle (jurors 70–100+)

- **itch.io page** hosting the same APK — a storefront page makes a sideloaded APK
  look intentional instead of sketchy, adds discovery, comments, and a devlog.
- **A 60-second vertical video** of a first playthrough reaction at the reveal
  (screen + face). One honest clip outperforms any copy.
- **README as landing page** — screenshots, the pitch line, install QR.

### Sequencing rule

Do not start Tier 2 until Tier 1 has produced at least ten verdict cards from
strangers-to-the-repo — Tier 1 is where the onboarding friction gets found and fixed
while the audience is forgiving.

## 5. Jury Night host kit (run of show)

Anyone with a table can host. Works in kitchens, pubs, classrooms, staff rooms.

1. **Before:** guests install from the release link / QR (5 min, see §7). Host reads
   nothing aloud — the summons screen does the framing.
2. **Reading (25–30 min, silent):** everyone reads the evidence at their own pace.
   Phones stay silent; the room goes quiet like a real jury box. Latecomers pair up
   and read over a shoulder (also the iOS workaround).
3. **Diaries (5 min):** everyone commits their diary — privately, before any talk.
4. **Deliberation (15–20 min, out loud):** host asks one question: *"Guilty or not —
   and what's your strongest doubt?"* around the table. Argue freely; diaries are
   already immutable, so anchoring is off the table.
5. **Verdict + reveal (together):** everyone locks a vote at the same moment, then
   reads the reveal in silence. Wait for the first person to swear.
6. **After:** exchange juror codes to fill each other's benches; the host posts the
   room's tally to the Jury Room thread (§3, M-3).

## 6. Measuring without analytics

The app ships no telemetry, no accounts, no tracking — that is a feature, and the
public pitch says so. Growth is measured at the edges:

```powershell
# Release download counts (rolling APK + zip asset)
gh api repos/yanniedog/simjury/releases --jq '.[].assets[] | {name, download_count}'
```

- Verdict cards seen in the wild (Jury Room posts, replies to the Tier-1 ask).
- Juror codes redeemed — self-reported at jury nights.
- Jury-night headcounts — a notebook is fine.

Milestones: **10** verdict cards from people the owner has met → Tier 1 works.
**100** cumulative jurors by the proxies above → this file gets a v2.

## 7. Friction audit (ordered by expected drop-off)

1. **Sideload trust screens** — "Install unknown apps" scares normal humans. Partial
   fixes shipped (signed release APK #44, browser-safe zip + install page #47).
   Remaining: itch.io page (Tier 3), QR cards at jury nights, a host who has done it
   once. Track: of people who say yes, how many reach the summons screen?
2. **Android-only** — pair-and-share at jury nights is the honest workaround; the
   CLI runs anywhere Java does, for the technical crowd.
3. **A 30-minute first ask** — C-001 is `estimated_minutes: 30`. Jury nights absorb
   this (it's the point of the evening); for cold installs consider shipping C-000
   (~5 min) alongside C-001 with a case picker as a "voir dire" starter — **open
   decision**, currently a single-case build flag (`PILOT_CASE_ID`).
4. **No obvious "why should I care"** — fixed by pitch discipline (§8), not features.

## 8. Spoiler policy for outreach

**The case's identity is the twist.** Public copy never names the defendant, the
year, the court, the real verdict, or the reform the case caused. All of that is the
reveal. This constraint is also the pitch:

> *"You're Juror #1 on a real trial from the age of gaslight. Every word of testimony
> is from the record; only the names are changed. Read the evidence, lock your
> verdict — it's permanent — then find out what really happened. Offline, free, no
> accounts. The reveal takes about thirty minutes to earn."*

Allowed in public: "a real historical trial", "names changed during play",
"your verdict is permanent", "the reveal", evidence/witness counts.
Not allowed: anything a banned-token scan of the case would flag, match/split
statistics against the historical jury, quotes from reveal layers or `truth_file`.

## 9. Sequencing & ownership

| Step | What | Kind | Depends on |
|------|------|------|------------|
| 1 | This playbook | docs PR | — |
| 2 | M-1 verdict card | app PR | — |
| 3 | M-2 jury bench + juror codes | app PR | M-1 (share plumbing) |
| 4 | M-3 Jury Room discussion + pinned tally | operator (GitHub UI) | — |
| 5 | Tier 1: 2 jury nights + 1 classroom | operator | M-1 shipped |
| 6 | itch.io page, Show HN, podcast emails | operator | 10 stranger cards |

Growth PRs must never edit case content, `truth_file` gating, or validator rules —
if a growth feature wants a rule relaxed (e.g. M-5 tally), that is an owner decision
recorded here first.
