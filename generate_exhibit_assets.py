#!/usr/bin/env python3
"""Generate schematic period-style exhibit PNGs for SimJury cases (v3 imagery rules)."""

from __future__ import annotations

import shutil
import subprocess
import sys
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
CASES = ROOT / "pilot" / "src" / "main" / "resources" / "cases"

PAPER = (248, 242, 228)
INK = (32, 28, 24)
RULE = (180, 168, 150)
ACCENT = (120, 40, 30)


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
    ):
        p = Path(name)
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def _draw_document(
    title: str,
    lines: list[str],
    *,
    width: int = 720,
    footer: str | None = None,
) -> Image.Image:
    line_h = 28
    margin = 48
    body_h = len(lines) * line_h + 40
    height = margin * 2 + 56 + body_h + (32 if footer else 0)
    img = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(img)
    title_font = _font(22)
    body_font = _font(18)
    small_font = _font(14)

    draw.rectangle((12, 12, width - 12, height - 12), outline=RULE, width=2)
    draw.line((margin, margin + 44, width - margin, margin + 44), fill=RULE, width=1)
    draw.text((margin, margin + 8), title.upper(), fill=ACCENT, font=title_font)

    y = margin + 64
    for line in lines:
        draw.text((margin, y), line, fill=INK, font=body_font)
        y += line_h

    if footer:
        draw.text((margin, height - margin - 8), footer, fill=RULE, font=small_font)

    return img


def c000_assets(exhibits_dir: Path) -> None:
    exhibits_dir.mkdir(parents=True, exist_ok=True)
    _draw_document(
        "Shop Ledger — Tuesday",
        [
            "Gold hunter watch — £12",
            "Shown to gentleman",
            "Name given: Mr Hartley, Brook Street",
            "No payment recorded",
        ],
        footer="Exhibit X-01 — schematic render",
    ).save(exhibits_dir / "x-01-ledger.png")

    _draw_document(
        "Pawn Ticket",
        [
            "Date: two days after shop incident",
            "Item: gold hunter watch",
            "Name on ticket: Hartley",
            "Advance sought: £8",
        ],
        footer="Exhibit X-02 — schematic render",
    ).save(exhibits_dir / "x-02-pawn-ticket.png")


def c001_assets(exhibits_dir: Path) -> None:
    exhibits_dir.mkdir(parents=True, exist_ok=True)
    _draw_document(
        "Clothing List",
        [
            "Dresses & mourning wear to order:",
            "• Bonnets (bonets in original)",
            "• Silk gowns",
            "• Gloves & mourning trim",
            "• Named court dressmaker shops listed",
        ],
        footer="Exhibit X-01 — Mrs Elling list (schematic)",
    ).save(exhibits_dir / "x-01-clothing-list.png")

    _draw_document(
        "Clothing List",
        [
            "Dresses & accessories for Mrs Garner",
            "Written on paper she supplied",
            "Items to be ordered before",
            "appointment on the following Monday",
        ],
        footer="Exhibit X-02 — schematic render",
    ).save(exhibits_dir / "x-02-clothing-list.png")

    # Handwriting comparison chart (schematic line-art, no real signatures)
    w, h = 720, 420
    img = Image.new("RGB", (w, h), PAPER)
    draw = ImageDraw.Draw(img)
    body_font = _font(16)
    draw.rectangle((12, 12, w - 12, h - 12), outline=RULE, width=2)
    draw.text((40, 24), "HANDWRITING COMPARISON CHART", fill=ACCENT, font=_font(20))
    draw.line((40, 56, w - 40, 56), fill=RULE)
    for i, label in enumerate(("Specimen A", "Specimen B", "Accused sample")):
        y = 80 + i * 110
        draw.text((40, y), label, fill=INK, font=body_font)
        draw.rectangle((40, y + 24, w - 40, y + 90), outline=INK, width=1)
        # Schematic wavy lines suggesting handwriting without copying real script
        for x in range(50, w - 50, 18):
            draw.line((x, y + 40 + (x % 3) * 4, x + 12, y + 52 + (x % 5) * 3), fill=INK, width=1)
    draw.text((40, h - 36), "Exhibit X-03 — schematic comparison (not a facsimile)", fill=RULE, font=_font(13))
    img.save(exhibits_dir / "x-03-handwriting-chart.png")


def shared_audio(exhibits_dir: Path) -> None:
    exhibits_dir.mkdir(parents=True, exist_ok=True)
    out = exhibits_dir / "exhibit-presented.ogg"
    if out.exists():
        return
    if shutil.which("ffmpeg") is None:
        print(f"warning: ffmpeg not found — skipping {out}", file=sys.stderr)
        return
    # Short procedural court-room chime (no external samples)
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=0.15",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=330:duration=0.25",
                "-filter_complex",
                "[0][1]concat=n=2:v=0:a=1,afade=t=out:st=0.3:d=0.1",
                "-c:a",
                "libvorbis",
                str(out),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"warning: could not generate {out}: {exc}", file=sys.stderr)


def main() -> None:
    c000 = CASES / "c_000" / "exhibits"
    c001 = CASES / "c_001" / "exhibits"
    c000_assets(c000)
    c001_assets(c001)
    shared_audio(c000)
    shared_audio(c001)
    print(f"Wrote exhibit assets under {CASES}")


if __name__ == "__main__":
    main()
