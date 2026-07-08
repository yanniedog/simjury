#!/usr/bin/env python3
"""Download PD source materials for all harness-eligible SimJury cases.

Reads case_sources_manifest.json. Writes to case_sources/<case_id>/.
Logs per-case acquisition status to case_sources/ACQUISITION_LOG.jsonl.

Usage:
  python3 fetch_case_sources.py [--case c_001] [--skip-pdf] [--extract-images]
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "case_sources_manifest.json"
OUT = ROOT / "case_sources"
UA = "SimJurySourceAcquisition/1.0 (research; +https://github.com/yanniedog/simjury)"
LOG = OUT / "ACQUISITION_LOG.jsonl"

ARCHIVE_DOWNLOAD = "https://archive.org/download/{ident}/{fname}"
ARCHIVE_META = "https://archive.org/metadata/{ident}"
DHI_JPG = "https://www.dhi.ac.uk/san/ccc/{folder}/{folder}{page:04d}.jpg"
GUTENBERG_TXT = "https://www.gutenberg.org/cache/epub/{gid}/pg{gid}.txt"


def log(event: dict[str, Any]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    event["ts"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")


def fetch_url(url: str, dest: Path, timeout: int = 120) -> bool:
    if dest.exists() and dest.stat().st_size > 0:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
        dest.write_bytes(data)
        return True
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        log({"action": "fetch_failed", "url": url, "dest": str(dest), "error": str(e)})
        return False


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def archive_files(ident: str) -> list[dict[str, Any]]:
    req = urllib.request.Request(ARCHIVE_META.format(ident=ident), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        meta = json.loads(resp.read().decode())
    files = []
    for f in meta.get("files", []):
        name = f.get("name", "")
        if "encrypted" in name or "meta" in name:
            continue
        if name.endswith(("_djvu.txt", ".pdf", ".epub")):
            files.append(f)
    # prefer djvu.txt and main pdf
    files.sort(key=lambda x: (0 if x["name"].endswith("_djvu.txt") else 1, x.get("size", 0)))
    return files


def download_archive_org(case_id: str, ident: str, skip_pdf: bool) -> dict[str, Any]:
    result: dict[str, Any] = {"identifier": ident, "downloaded": [], "skipped": [], "errors": []}
    dest_dir = OUT / case_id / "nbt"
    dest_dir.mkdir(parents=True, exist_ok=True)
    try:
        files = archive_files(ident)
    except Exception as e:
        result["errors"].append(f"metadata: {e}")
        return result
    for f in files:
        name = f["name"]
        if skip_pdf and name.endswith(".pdf"):
            result["skipped"].append(name)
            continue
        if name.endswith(".epub"):
            result["skipped"].append(name)
            continue
        dest = dest_dir / name
        url = ARCHIVE_DOWNLOAD.format(ident=ident, fname=name)
        if fetch_url(url, dest, timeout=300):
            result["downloaded"].append({"file": name, "bytes": dest.stat().st_size, "sha256": sha256(dest)})
            log({"action": "archive_ok", "case": case_id, "ident": ident, "file": name, "bytes": dest.stat().st_size})
        else:
            result["errors"].append(name)
    return result


def download_dhi_session(case_id: str, folder: str, page_start: int, page_end: int) -> dict[str, Any]:
    result: dict[str, Any] = {"folder": folder, "downloaded": 0, "missing": 0}
    dest_dir = OUT / case_id / "sessions" / folder
    dest_dir.mkdir(parents=True, exist_ok=True)
    for page in range(page_start, page_end + 1):
        fname = f"{folder}{page:04d}.jpg"
        dest = dest_dir / fname
        if dest.exists() and dest.stat().st_size > 1000:
            result["downloaded"] += 1
            continue
        url = DHI_JPG.format(folder=folder, page=page)
        if fetch_url(url, dest, timeout=30):
            if dest.stat().st_size > 500:
                result["downloaded"] += 1
            else:
                dest.unlink(missing_ok=True)
                result["missing"] += 1
        else:
            result["missing"] += 1
        time.sleep(0.05)
    log({"action": "dhi_session", "case": case_id, "folder": folder, **result})
    return result


def download_hansard(case_id: str, url: str, idx: int) -> bool:
    dest = OUT / case_id / "supplementary" / f"hansard_{idx:02d}.html"
    return fetch_url(url, dest)


def download_gutenberg(case_id: str, gid: str) -> bool:
    dest = OUT / case_id / "supplementary" / f"gutenberg_{gid}.txt"
    return fetch_url(GUTENBERG_TXT.format(gid=gid), dest, timeout=60)


def extract_pdf_images(case_id: str) -> dict[str, Any]:
    """Extract embedded images from NBT PDFs using pdfimages if available."""
    result: dict[str, Any] = {"extracted": 0, "errors": []}
    nbt_dir = OUT / case_id / "nbt"
    img_dir = OUT / case_id / "multimedia" / "pdf_extract"
    if not nbt_dir.exists():
        return result
    pdfimages = subprocess.run(["which", "pdfimages"], capture_output=True, text=True)
    if pdfimages.returncode != 0:
        result["errors"].append("pdfimages not installed")
        return result
    img_dir.mkdir(parents=True, exist_ok=True)
    for pdf in sorted(nbt_dir.glob("*.pdf")):
        prefix = img_dir / pdf.stem
        if any(img_dir.glob(f"{pdf.stem}*")):
            continue
        proc = subprocess.run(
            ["pdfimages", "-all", str(pdf), str(prefix)],
            capture_output=True,
            text=True,
        )
        if proc.returncode == 0:
            count = len(list(img_dir.glob(f"{pdf.stem}*")))
            result["extracted"] += count
            log({"action": "pdfimages", "case": case_id, "pdf": pdf.name, "images": count})
        else:
            result["errors"].append(f"{pdf.name}: {proc.stderr[:200]}")
    return result


def write_case_readme(case_id: str, case: dict[str, Any], status: dict[str, Any]) -> None:
    readme = OUT / case_id / "ACQUISITION.md"
    lines = [
        f"# Source acquisition — {case['name']}",
        "",
        f"**Case ID:** `{case_id}`  ",
        f"**Harness:** {case['harness']}  ",
        f"**Fetched:** {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}",
        "",
        "## Files obtained",
        "",
    ]
    base = OUT / case_id
    for sub in ["nbt", "sessions", "supplementary", "multimedia"]:
        d = base / sub
        if not d.exists():
            continue
        files = sorted(d.rglob("*"))
        files = [f for f in files if f.is_file()]
        if files:
            lines.append(f"### `{sub}/`")
            lines.append("")
            for f in files[:40]:
                rel = f.relative_to(base)
                lines.append(f"- `{rel}` ({f.stat().st_size:,} bytes)")
            if len(files) > 40:
                lines.append(f"- … and {len(files) - 40} more")
            lines.append("")
    if case.get("notes"):
        lines.extend(["## Notes", "", case["notes"], ""])
    lines.extend(["## Fetch status", "", "```json", json.dumps(status, indent=2), "```", ""])
    readme.write_text("\n".join(lines), encoding="utf-8")


def process_case(case: dict[str, Any], skip_pdf: bool, extract_images: bool) -> dict[str, Any]:
    case_id = case["id"]
    status: dict[str, Any] = {"case_id": case_id, "name": case["name"], "archive": [], "dhi": [], "hansard": [], "gutenberg": []}

    for ident in case.get("archive_org", []):
        status["archive"].append(download_archive_org(case_id, ident, skip_pdf))

    for i, sess in enumerate(case.get("dhi_sessions", [])):
        status["dhi"].append(
            download_dhi_session(case_id, sess["folder"], sess["page_start"], sess["page_end"])
        )

    for i, url in enumerate(case.get("hansard", [])):
        ok = download_hansard(case_id, url, i)
        status["hansard"].append({"url": url, "ok": ok})

    for gid in case.get("gutenberg", []):
        ok = download_gutenberg(case_id, gid)
        status["gutenberg"].append({"id": gid, "ok": ok})

    if extract_images:
        status["multimedia"] = extract_pdf_images(case_id)

    write_case_readme(case_id, case, status)
    log({"action": "case_complete", "case": case_id, "status": status})
    return status


def write_master_index(results: list[dict[str, Any]]) -> None:
    index = OUT / "INDEX.md"
    lines = [
        "# Case Sources — Acquisition Index",
        "",
        f"Generated: {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}",
        "",
        "| Case | Name | NBT text | NBT PDF | Sessions JPGs | Supplementary |",
        "|------|------|----------|---------|---------------|---------------|",
    ]
    for r in results:
        cid = r["case_id"]
        name = r["name"]
        has_txt = any(
            any(d.get("file", "").endswith("_djvu.txt") for d in a.get("downloaded", []))
            for a in r.get("archive", [])
        )
        has_pdf = any(
            any(d.get("file", "").endswith(".pdf") for d in a.get("downloaded", []))
            for a in r.get("archive", [])
        )
        sess = sum(d.get("downloaded", 0) for d in r.get("dhi", []))
        supp = sum(1 for h in r.get("hansard", []) if h.get("ok")) + sum(
            1 for g in r.get("gutenberg", []) if g.get("ok")
        )
        lines.append(
            f"| {cid} | {name} | {'yes' if has_txt else '—'} | {'yes' if has_pdf else '—'} | {sess or '—'} | {supp or '—'} |"
        )
    lines.extend(
        [
            "",
            "Run `python3 fetch_case_sources.py` to refresh.",
            "",
            "See per-case `ACQUISITION.md` and `case_sources_manifest.json`.",
        ]
    )
    index.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--case", help="Only fetch one case id e.g. c_001")
    parser.add_argument("--skip-pdf", action="store_true", help="Skip large PDF downloads")
    parser.add_argument("--extract-images", action="store_true", help="Run pdfimages on PDFs")
    args = parser.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    cases = manifest["cases"]
    if args.case:
        cases = [c for c in cases if c["id"] == args.case]
        if not cases:
            print(f"Unknown case: {args.case}", file=sys.stderr)
            return 1

    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    for i, case in enumerate(cases):
        print(f"[{i+1}/{len(cases)}] {case['id']} — {case['name']}", flush=True)
        results.append(process_case(case, args.skip_pdf, args.extract_images))

    write_master_index(results)
    summary_path = OUT / "ACQUISITION_SUMMARY.json"
    summary_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"Done. {len(results)} cases. Index: {OUT / 'INDEX.md'}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
