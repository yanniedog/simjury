# EX-1 Source Acquisition Handoff — C-001

**Status:** ACCESS CONFIRMED (agent research, 2026-07-07)  
**Case:** C-001 (R v. Adolf Beck / play title *The List*)  
**Authority:** `PHASE4-PLAN.md` §2, `CASE_HARNESS.md` §5 Step B  
**Supersedes:** `BLOCKED_REPORT.md` (resolved)

---

## Summary

All four harness source classes (b)–(e) have confirmed public-domain access paths. Class (a) Old Bailey Online text is **excluded** per EX-5 (no commercial licence). Testimony transcription must use Sessions Papers page images (b) and Committee report (c) — not OBO copy.

---

## Source access matrix

| ID | Class | Document | Access status | Primary URL / locator |
|----|-------|----------|---------------|------------------------|
| S-01 | (c) | Committee of Inquiry report (Cd. 2315, 1904) | **Confirmed** | [NLI catalog](https://catalogue.nli.ie/Record/vtls000420486); [Hansard presentation](https://api.parliament.uk/historic-hansard/lords/1905/feb/14/adolf-beck-committee-of-inquiry); extensive extracts with page refs in Watson, *Adolf Beck (1877–1904)* (NBT 1922) [Archive.org](https://archive.org/details/in.ernet.dli.2015.31183) |
| S-02 | (b) | 1896 Central Criminal Court Sessions Papers | **Confirmed** | PD page images: `https://www.dhi.ac.uk/san/ccc/18960224/` (seq 189602240100–189602240108+); trial transcript also in NBT pp. 117–155 |
| S-03 | (d) | *Morning Advertiser* (London), Jan–Mar 1896 | **Confirmed** | [British Newspaper Archive](https://www.britishnewspaperarchive.co.uk/titles/morning-advertiser) (BL/0001427); quoted at NBT p. 16 (24 Jan 1896 police court) |
| S-04 | (e) | Pardon + compensation (Parliamentary record) | **Confirmed** | [Hansard HC 3 Aug 1904](https://api.parliament.uk/historic-hansard/commons/1904/aug/03/wrongful-conviction-compensation-for); saved excerpt in `sources_research/hansard_compensation_1904.txt` |

---

## EX-5 — Old Bailey Online

**Decision:** No OBO licence. OBO trial text (`oldbaileyonline.org`) must **not** be copied into case JSON. Use class (b) Sessions Papers images at `dhi.ac.uk/san/ccc/` for independent transcription. See `sources_research/SESSIONS_PAPERS.md`.

---

## Transcription authority

| Material | Transcribe from | Do not use |
|----------|-----------------|------------|
| 1896 trial testimony | S-02 Sessions Papers scans + NBT (1922, PD) cross-check | OBO website text |
| 1904 inquiry / ruling | S-01 Cd. 2315 pages cited in NBT appendices XI–XII | Wikipedia, secondary journalism |
| Identification procedure | S-02 + S-03 Morning Advertiser 24 Jan 1896 (via NBT p. 16) | — |
| Truth file aftermath | S-04 Hansard + S-01 Cd. 2315 factual layers | 1904 inquiry facts in trial phase (AD-5) |

---

## Auxiliary reference (PD)

| Work | Citation | Role |
|------|----------|------|
| Watson, *Adolf Beck (1877–1904)* | Notable British Trials, William Hodge, 1922 | PD trial transcript + Cd. 2315 extracts; transcription aid only — cite S-01/S-02 locators |
| Hansard | api.parliament.uk historic Hansard | S-04 official record |

**Not used:** Coates, *The Strange Story of Adolph Beck* (1999) — abridged Cd. 2315 reprint; not public domain.

---

## Next steps (P4-4+)

1. Content Curator: resolve `TABULATION.md` locators (updated in this PR)
2. Engineer: author W-01 (Fanny Nutt) testimony from S-02 NBT p. 118+ / Sessions Papers
3. QA: banned-token scan + validator green after each witness PR

---

*Agent research branch: `cursor/phase4-ex1-sources-found-3d2c`*
