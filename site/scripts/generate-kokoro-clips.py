import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

NARRATION_SHARDS = 32


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate sharded Kokoro MP3 clips")
    parser.add_argument("job", type=Path)
    parser.add_argument("output", type=Path)
    options = parser.parse_args()
    job = json.loads(options.job.read_text(encoding="utf-8"))
    pipeline = KPipeline(lang_code="a")

    for clip in job["clips"]:
        clip_id = clip["id"]
        if not re.fullmatch(r"[a-z0-9-]+-[0-9a-f]{8}", clip_id):
            raise ValueError(f"Unsafe clip id: {clip_id}")
        shard = str(int(clip_id[-8:-6], 16) % NARRATION_SHARDS)
        target = options.output / shard / f"{clip_id}.mp3"
        target.parent.mkdir(parents=True, exist_ok=True)
        chunks = [
            np.asarray(audio, dtype=np.float32)
            for _, _, audio in pipeline(clip["text"], voice=clip["voice"], speed=1)
        ]
        if not chunks:
            raise RuntimeError(f"Kokoro produced no audio for {clip_id}")
        audio = np.concatenate(chunks)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
            wav = Path(handle.name)
        try:
            sf.write(wav, audio, job["sampleRate"], subtype="PCM_16")
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-codec:a", "libmp3lame",
                 "-q:a", "3", str(target)],
                check=True,
            )
        finally:
            wav.unlink(missing_ok=True)
        print(f"{job['caseId']}: {target.name}")


if __name__ == "__main__":
    main()
