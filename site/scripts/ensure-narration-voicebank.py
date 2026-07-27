"""Build or refresh the Qwen3-TTS VoiceDesign reference bank.

Each profile in site/app/src/lib/narrationVoices.json becomes a short reference WAV
used later by the Base model for consistent per-speaker cloning.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("ensure-narration-voicebank")


def pick_device() -> str:
    if torch.cuda.is_available():
        return "cuda:0"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def model_kwargs(device: str) -> dict:
    kwargs: dict = {
        "device_map": device,
        "dtype": torch.bfloat16 if device.startswith("cuda") else torch.float32,
    }
    if device.startswith("cuda"):
        kwargs["attn_implementation"] = "sdpa"
    return kwargs


def profile_complete(output: Path, voice_id: str) -> bool:
    """Clone jobs need both the reference WAV and its JSON metadata."""
    return (output / f"{voice_id}.wav").is_file() and (output / f"{voice_id}.json").is_file()


def main() -> None:
    parser = argparse.ArgumentParser(description="Ensure Qwen VoiceDesign reference WAVs exist")
    parser.add_argument("--voices", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--force", action="store_true")
    options = parser.parse_args()

    catalog = json.loads(options.voices.read_text(encoding="utf-8"))
    profiles = list(catalog["male"]) + list(catalog["female"])
    options.output.mkdir(parents=True, exist_ok=True)
    missing = [
        profile
        for profile in profiles
        if options.force or not profile_complete(options.output, profile["id"])
    ]
    if not missing:
        log.info("Voicebank complete (%d profiles).", len(profiles))
        return

    device = pick_device()
    log.info("Designing %d missing voices on %s", len(missing), device)
    # Soften CPU thread oversubscription on GitHub-hosted runners.
    if device == "cpu":
        torch.set_num_threads(max(1, min(8, os.cpu_count() or 4)))

    from qwen_tts import Qwen3TTSModel

    model_id = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
    log.info("Loading %s", model_id)
    model = Qwen3TTSModel.from_pretrained(model_id, **model_kwargs(device))
    ref_text = catalog["refText"]

    for profile in missing:
        voice_id = profile["id"]
        target = options.output / f"{voice_id}.wav"
        log.info("Designing %s (%s)", voice_id, profile.get("label", voice_id))
        wavs, sr = model.generate_voice_design(
            text=ref_text,
            language="English",
            instruct=profile["instruct"],
        )
        audio = np.asarray(wavs[0], dtype=np.float32)
        if audio.size == 0:
            raise RuntimeError(f"VoiceDesign produced empty audio for {voice_id}")
        peak = float(np.max(np.abs(audio)))
        if peak > 1.0:
            audio = audio / peak
        sf.write(target, audio, int(sr), subtype="PCM_16")
        meta = {
            "id": voice_id,
            "label": profile.get("label"),
            "instruct": profile["instruct"],
            "refText": ref_text,
            "sampleRate": int(sr),
        }
        (options.output / f"{voice_id}.json").write_text(
            f"{json.dumps(meta, indent=2)}\n",
            encoding="utf-8",
        )
        log.info("Wrote %s (%d samples @ %d Hz)", target.name, audio.shape[0], int(sr))

    log.info("Voicebank ready at %s", options.output)


if __name__ == "__main__":
    main()
