"""Generate sharded Qwen3-TTS narration MP3 clips from a case job file.

Uses a VoiceDesign reference bank plus the Base clone model so each speaker keeps
a stable, strongly gendered timbre across every line.
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qwen_tts_load import load_qwen_model, pick_device

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("generate-narration-clips")

NARRATION_SHARDS = 32


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


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate sharded Qwen narration MP3 clips")
    parser.add_argument("job", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--voicebank", type=Path, required=True)
    options = parser.parse_args()

    job = json.loads(options.job.read_text(encoding="utf-8"))
    clips = job["clips"]
    if not clips:
        raise RuntimeError(f"Job {options.job} has no clips")

    needed = sorted({clip["voice"] for clip in clips})
    for voice_id in needed:
        ref = options.voicebank / f"{voice_id}.wav"
        meta = options.voicebank / f"{voice_id}.json"
        if not ref.is_file() or not meta.is_file():
            raise FileNotFoundError(f"Missing voicebank assets for {voice_id} in {options.voicebank}")

    device = pick_device()
    log.info(
        "Generating %d clips for %s on %s using %d voices",
        len(clips),
        job["caseId"],
        device,
        len(needed),
    )
    if device == "cpu":
        torch.set_num_threads(max(1, min(8, os.cpu_count() or 4)))

    model = load_qwen_model("Qwen/Qwen3-TTS-12Hz-1.7B-Base", device)

    prompts: dict[str, object] = {}
    for voice_id in needed:
        meta = json.loads((options.voicebank / f"{voice_id}.json").read_text(encoding="utf-8"))
        ref_wav = options.voicebank / f"{voice_id}.wav"
        log.info("Building clone prompt for %s", voice_id)
        prompts[voice_id] = model.create_voice_clone_prompt(
            ref_audio=str(ref_wav),
            ref_text=meta["refText"],
            x_vector_only_mode=False,
        )

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
        log.info(
            "[%d/%d] %s voice=%s gender=%s",
            index,
            len(clips),
            clip_id,
            clip["voice"],
            clip.get("gender"),
        )
        wavs, sr = model.generate_voice_clone(
            text=text,
            language="English",
            voice_clone_prompt=prompts[clip["voice"]],
        )
        audio = np.asarray(wavs[0], dtype=np.float32)
        if audio.size == 0:
            raise RuntimeError(f"Qwen produced no audio for {clip_id}")
        peak = float(np.max(np.abs(audio)))
        if peak > 1.0:
            audio = audio / peak

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
            wav_path = Path(handle.name)
        try:
            sf.write(wav_path, audio, int(sr), subtype="PCM_16")
            encode_mp3(wav_path, target)
        finally:
            wav_path.unlink(missing_ok=True)
        log.info("%s: wrote %s", job["caseId"], target)

    log.info("Done %s (%d clips)", job["caseId"], len(clips))


if __name__ == "__main__":
    main()
