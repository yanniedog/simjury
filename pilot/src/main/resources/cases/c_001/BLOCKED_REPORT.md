# BLOCKED REPORT — C-001 source acquisition

**Status:** BLOCKED — operator handoff incomplete  
**Case:** C-001 (R v. Adolf Beck / play title *The List*)  
**Authority:** `PHASE4-PLAN.md` §2, `CASE_HARNESS.md` §5 Step B

---

## Missing documents

| Document | Class | Needed for | Acceptable substitute |
|----------|-------|------------|----------------------|
| Committee of Inquiry report (Cd. 2315, 1904–05) | (c) | W-01..W-09 tabulation, ruling 8.6.5, D-04, truth file | None within class — primary source |
| 1896 Sessions Papers / Proceedings | (b) | Complainant testimony, W-08 accused, exhibits X-01..X-06 | Independent transcription from PD page images |
| Contemporaneous newspaper report (1896 trial) | (d) | Cross-check identification procedure | Any pre-1926 PD trial report |
| Pardon / parliamentary compensation record | (e) | Truth file aftermath layers only (AD-5) | Official PD notice text |
| OBO licence decision (EX-5) | — | Whether class (a) Old Bailey Online text may be used | Record "no OBO" in `LICENSING.md` (deferred to Phase 6) |

---

## Impact

- Cannot tabulate rows: fraud method, identification procedure, handwriting expert, prior-conviction ruling, accused denial, truth-file aftermath
- Cannot author witnesses: W-01..W-09 testimony blocks
- Cannot author exhibits: X-01..X-10 period documents
- `sources.json` contains bibliographic scaffold only — locators will be tracked in `TABULATION.md` once operator confirms access

---

## Operator action required

1. Confirm access or supply PDF for **Committee of Inquiry report** (Cd. 2315) covering 1896 trial evidence pages.
2. Confirm access or supply **1896 Sessions Papers** page images for independent transcription.
3. Supply at least one **1896 newspaper trial report** (pre-1926, public domain).
4. Supply **pardon / compensation** official record text for truth-file layers (post-trial only).
5. Record EX-5 decision: OBO licence yes/no.

When each row is **obtained** or **access confirmed**, update this report, then begin `TABULATION.md` (P4-3) with the correct locators.

---

*Scaffold PR: `cursor/phase4-ex1-handoff-3d2c` — no testimony JSON on this branch.*
