"""Generate sharded Kokoro-82M narration MP3 clips from a case job file.

Uses built-in Kokoro speaker packs (American + British English). No voicebank
or cloning step ? each clip's voice id maps directly to a Kokoro speaker.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("generate-narration-clips")

NARRATION_SHARDS = 32
CATALOG_PATH = Path(__file__).resolve().parent.parent / "app" / "src" / "lib" / "narrationVoices.json"


def encode_mp3(wav: Path, target: Path) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            str(wav),
            "-codec:a",
            "libmp3lame",
            "-q:a",
            "2",
            str(target),
        ],
        check=True,
    )


def lang_for_voice(voice_id: str, catalog: dict) -> str:
    for profile in list(catalog.get("male", [])) + list(catalog.get("female", [])):
        if profile["id"] == voice_id:
            return str(profile.get("lang") or ("b" if voice_id.startswith(("bf_", "bm_")) else "a"))
    # Prefix fallback for intentional ad-hoc Kokoro voices (British packs).
    if voice_id.startswith(("bf_", "bm_")):
        return "b"
    if voice_id.startswith(("af_", "am_")):
        return "a"
    raise ValueError(
        f"Unknown Kokoro voice id {voice_id!r}: not in catalog and does not use a known prefix"
    )


def synthesise(pipeline, text: str, voice: str) -> np.ndarray:
    chunks: list[np.ndarray] = []
    for _gs, _ps, audio in pipeline(text, voice=voice):
        arr = np.asarray(audio, dtype=np.float32)
        if arr.size:
            chunks.append(arr.reshape(-1))
    if not chunks:
        raise RuntimeError(f"Kokoro produced no audio for voice={voice}")
    return np.concatenate(chunks)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate sharded Kokoro narration MP3 clips")
    parser.add_argument("job", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument(
        "--voicebank",
        type=Path,
        required=False,
        help="Ignored (kept for workflow compatibility; Kokoro uses built-in voices)",
    )
    options = parser.parse_args()

    job = json.loads(options.job.read_text(encoding="utf-8"))
    clips = job["clips"]
    if not clips:
        raise RuntimeError(f"Job {options.job} has no clips")
    sample_rate = int(job.get("sampleRate") or 0)
    if sample_rate <= 0:
        raise ValueError(f"Job {options.job} missing positive sampleRate")

    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    needed = sorted({clip["voice"] for clip in clips})
    for voice_id in needed:
        lang_for_voice(voice_id, catalog)  # validates known id or known prefix

    threads = max(1, min(8, os.cpu_count() or 4))
    torch.set_num_threads(threads)
    log.info(
        "Generating %d clips for %s on CPU (%d threads) using %d Kokoro voices",
        len(clips),
        job["caseId"],
        threads,
        len(needed),
    )

    from kokoro import KPipeline

    pipelines: dict[str, object] = {}
    for lang in sorted({lang_for_voice(v, catalog) for v in needed}):
        log.info("Loading Kokoro KPipeline lang_code=%s", lang)
        pipelines[lang] = KPipeline(lang_code=lang)

    options.output.mkdir(parents=True, exist_ok=True)
    for index, clip in enumerate(clips, start=1):
        clip_id = clip["id"]
        if not re.fullmatch(r"[a-z0-9-]+-[0-9a-f]{8}", clip_id):
            raise ValueError(f"Unsafe clip id: {clip_id}")
        shard = str(int(clip_id[-8:-6], 16) % NARRATION_SHARDS)
        target = options.output / shard / f"{clip_id}.mp3"
        target.parent.mkdir(parents=True, exist_ok=True)

        text = clip["text"].strip()
        if not text:
            raise RuntimeError(f"Empty text for {clip_id}")
        voice = clip["voice"]
        lang = lang_for_voice(voice, catalog)
        log.info(
            "[%d/%d] %s voice=%s lang=%s gender=%s",
            index,
            len(clips),
            clip_id,
            voice,
            lang,
            clip.get("gender"),
        )
        audio = synthesise(pipelines[lang], text, voice)
        peak = float(np.max(np.abs(audio)))
        if peak > 1.0:
            audio = audio / peak

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
            wav_path = Path(handle.name)
        try:
            sf.write(wav_path, audio, sample_rate, subtype="PCM_16")
            encode_mp3(wav_path, target)
        finally:
            wav_path.unlink(missing_ok=True)
        log.info("%s: wrote %s", job["caseId"], target)

    log.info("Done %s (%d clips)", job["caseId"], len(clips))


if __name__ == "__main__":
    main()
