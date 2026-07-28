"""Generate sharded Scylla's Band narration MP3 clips (experimental alt mode).

Removable with narrationAltVoice.json + scylla-narration.yml + sibling scripts.
Uses free CPU ONNX (prefer onnx-int8). No personal GPU / paid runners.
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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("generate-scylla-clips")

NARRATION_SHARDS = 32
CATALOG_PATH = (
    Path(__file__).resolve().parent.parent / "app" / "src" / "lib" / "narrationAltVoice.json"
)
# Mild courtroom delivery: calm core, slight questioning for cross-exam feel.
DEFAULT_AFFECT = {"calm": 0.45, "questioning": 0.15}


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


def language_for(voice_id: str, catalog: dict) -> str:
    languages = catalog.get("languages") or {}
    lang = languages.get(voice_id)
    if not lang:
        raise ValueError(f"Unknown Scylla voice id {voice_id!r}: missing languages entry")
    return str(lang)


def audio_from_result(result: object) -> tuple[np.ndarray, int]:
    if hasattr(result, "audio"):
        audio = getattr(result, "audio")
    elif isinstance(result, dict) and "audio" in result:
        audio = result["audio"]
    else:
        audio = result
    if hasattr(audio, "detach"):
        audio = audio.detach().cpu().numpy()
    arr = np.asarray(audio, dtype=np.float32).reshape(-1)
    if arr.size == 0:
        raise RuntimeError("Scylla produced empty audio")
    sample_rate = (
        getattr(result, "sample_rate", None)
        or getattr(result, "sampleRate", None)
        or (result.get("sample_rate") if isinstance(result, dict) else None)
        or 24000
    )
    return arr, int(sample_rate)


def resolve_bundle(explicit: Path | None) -> Path:
    if explicit is not None:
        if not explicit.is_dir():
            raise FileNotFoundError(f"Scylla bundle not found: {explicit}")
        return explicit
    env = os.environ.get("SCYLLA_BUNDLE")
    if env:
        path = Path(env)
        if path.is_dir():
            return path
        raise FileNotFoundError(f"SCYLLA_BUNDLE is not a directory: {path}")
    candidates = [
        Path("scyllasband/models/onnx-int8"),
        Path("scyllasband/models/onnx"),
        Path(".scyllasband/scyllasband/models/onnx-int8"),
        Path(".scyllasband/scyllasband/models/onnx"),
    ]
    for path in candidates:
        if path.is_dir():
            return path
    raise FileNotFoundError(
        "No Scylla bundle found. Run: python -m scyllasband download --runtime-bundles onnx-int8"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate sharded Scylla narration MP3 clips")
    parser.add_argument("job", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument(
        "--bundle",
        type=Path,
        default=None,
        help="Path to scyllasband models/onnx or models/onnx-int8",
    )
    options = parser.parse_args()

    job = json.loads(options.job.read_text(encoding="utf-8"))
    clips = job["clips"]
    if not clips:
        raise RuntimeError(f"Job {options.job} has no clips")
    sample_rate_job = int(job.get("sampleRate") or 0)
    if sample_rate_job <= 0:
        raise ValueError(f"Job {options.job} missing positive sampleRate")

    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    needed = sorted({clip["voice"] for clip in clips})
    for voice_id in needed:
        language_for(voice_id, catalog)

    bundle = resolve_bundle(options.bundle)
    log.info(
        "Generating %d Scylla clips for %s from bundle %s (%d voices)",
        len(clips),
        job["caseId"],
        bundle,
        len(needed),
    )

    from scyllasband import ScyllasBandRuntime, SynthesisRequest

    runtime = ScyllasBandRuntime.from_bundle(
        str(bundle),
        backends=["onnx"],
        onnx_autotune_threads=True,
    )
    warmup_voice = needed[0]
    runtime.warmup(voice_id=warmup_voice, language=language_for(warmup_voice, catalog))

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
        language = language_for(voice, catalog)
        log.info(
            "[%d/%d] %s voice=%s lang=%s gender=%s",
            index,
            len(clips),
            clip_id,
            voice,
            language,
            clip.get("gender"),
        )
        result = runtime.synthesize(
            SynthesisRequest(
                text=text,
                voice_id=voice,
                language=language,
                affect=dict(DEFAULT_AFFECT),
                affect_guidance_scale=1.0,
                sampler="heun",
                steps=8,
            )
        )
        audio, sample_rate = audio_from_result(result)
        if sample_rate != sample_rate_job:
            log.warning(
                "%s: sample_rate %s != job %s; writing runtime rate",
                clip_id,
                sample_rate,
                sample_rate_job,
            )
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
