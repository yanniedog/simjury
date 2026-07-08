# Case Source Acquisition — Complete Run

**Date:** 2026-07-08  
**Scope:** 30 harness-eligible cases (C-001 through C-023 plus multimedia extras C-024–C-030)  
**Tool:** `python3 fetch_case_sources.py`  
**On-disk bundle:** `case_sources/` (~1.4 GB after full fetch)

---

## What was obtained

| Asset type | Count | Location | Git |
|------------|------:|----------|-----|
| NBT full-text transcripts (`*_djvu.txt`) | 26 | `case_sources/<id>/nbt/` | **Committed** |
| NBT PDFs (illustrations + print facsimile) | 38 | `case_sources/<id>/nbt/` | Local only (`.gitignore`) |
| DHI Sessions Papers page scans (JPG) | 1,084 | `case_sources/<id>/sessions/` | Local only |
| Hansard / Gutenberg supplementary | 4 | `case_sources/<id>/supplementary/` | Committed (HTML/txt) |
| Per-case acquisition reports | 30 | `case_sources/<id>/ACQUISITION.md` | Committed |

### Transcript coverage

| Status | Cases | Notes |
|--------|-------|-------|
| **Full NBT text** | 26 | Machine-readable testimony via Archive.org `_djvu.txt` |
| **Sessions JPG only** | c_010, c_012 | Smethurst, Wood — no NBT on Archive.org; transcribe from class (b) images |
| **Encrypted PDF only** | c_022, c_027, c_030 | Royal Mail, Baccarat, Stratton auxiliary — Archive.org borrow gate on plaintext; PDF encrypted |
| **Sessions + NBT** | 10 Old Bailey cases | Independent transcription path per EX-5 |

---

## How to refresh the full binary bundle

```bash
cd /workspace
python3 fetch_case_sources.py
```

Options:

- `--case c_001` — single case
- `--skip-pdf` — text and sessions only (faster)
- `--extract-images` — requires `poppler-utils` / `pdfimages` for plate extraction

**DHI Sessions note:** Index pages (`/san/ccc/<date>/`) return 403 from some cloud IPs; **direct JPG URLs work** (`.../<date><page>.jpg`).

---

## Per-case index

See [`case_sources/INDEX.md`](case_sources/INDEX.md) and [`case_sources/ACQUISITION_SUMMARY.json`](case_sources/ACQUISITION_SUMMARY.json).

---

## Multimedia exhibits (sourcing)

NBT PDFs contain trial **plates** (handwriting charts, plans, photographs of exhibits). SimJury v3 requires **schematic re-renders** — not raw photos of real people in the APK.

Workflow:

1. Locate plate in committed `_djvu.txt` or local PDF page reference  
2. Tabulate in `TABULATION.md`  
3. Author exhibit JSON with `kind: comparison|map|document`  
4. Create vector/PNG schematic asset from PD source description  

Cases with richest multimedia evidence: see `CASE_MULTIMEDIA_CANDIDATES.md`.

---

## Known gaps (operator action)

| Gap | Cases | Mitigation |
|-----|-------|------------|
| British Newspaper Archive | All | Subscription — class (d) supplementary |
| NBT Parry 1931 (Smethurst) | c_010 | NLI library scan |
| NBT Hogarth 1936 (Wood) | c_012 | Library |
| Archive.org borrow 401 on plaintext | c_022, c_027 | Encrypted PDF on disk; or physical/library copy |
| Stratton primary trial pamphlet | c_030 | Auxiliary forensic book only — locate 1905 trial account |
| Cd. 2315 full PDF (Beck) | c_001 | NLI catalog — extracts in NBT |

---

## Manifest

Machine-readable case list: [`case_sources_manifest.json`](case_sources_manifest.json)

---

## Harness

Only **eligible** cases included. Blocked cases (Wilde, Christie, child-victim volumes, etc.) are **not** in this bundle.

EX-5: No Old Bailey Online XML text in this acquisition.
