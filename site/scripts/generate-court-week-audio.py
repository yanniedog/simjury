"""Produce one mixed prerecorded file per authored Court Week audio segment.

The input is a deterministic reviewed job emitted by
``site/app/scripts/court-week-audio-jobs.ts``. Kokoro runs only here, in a
trusted GitHub Actions production job; browsers never invoke an AI service.
"""

from __future__ import annotations

import argparse
import html
import importlib.metadata
import json
import logging
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

log = logging.getLogger("court-week-audio")
JOB_SCHEMA = "simjury.court-week-audio-job/v1"
SESSION_SCHEMA = "simjury.court-week-session-media/v1"
TARGET_LUFS = -18.0
TARGET_TRUE_PEAK = -1.5
RELEASE_TRUE_PEAK_CEILING = -0.5
RETRY_TRUE_PEAK_TARGET = -1.25


def run(command: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=True,
        text=True,
        capture_output=capture,
    )


def validate_job(job: dict[str, Any]) -> None:
    if job.get("schema") != JOB_SCHEMA:
        raise ValueError(f"Unsupported audio job schema: {job.get('schema')!r}")
    if job.get("caseId") != "cw-0001":
        raise ValueError("Court Week audio jobs must target cw-0001")
    if not re.fullmatch(r"cw-0001-(monday|tuesday|wednesday|thursday|friday|saturday|sunday)", str(job.get("sessionId"))):
        raise ValueError(f"Unsafe session id: {job.get('sessionId')!r}")
    if int(job.get("sampleRate", 0)) != 24_000:
        raise ValueError("Court Week synthesis sample rate must be 24000 Hz")
    segments = job.get("segments")
    if not isinstance(segments, list) or not 8 <= len(segments) <= 12:
        raise ValueError("Every Court Week day must contain 8-12 audio segments")
    cue_ids: set[str] = set()
    opaque_ids: set[str] = set()
    for segment in segments:
        opaque_id = str(segment.get("opaqueId", ""))
        if not re.fullmatch(r"[0-9a-f]{32}", opaque_id) or opaque_id in opaque_ids:
            raise ValueError(f"Invalid or duplicate opaque segment id: {opaque_id!r}")
        opaque_ids.add(opaque_id)
        cues = segment.get("cues")
        if not isinstance(cues, list) or not cues:
            raise ValueError(f"Audio segment {opaque_id} has no cues")
        for cue in cues:
            cue_id = str(cue.get("id", ""))
            if not cue_id or cue_id in cue_ids:
                raise ValueError(f"Missing or duplicate cue id: {cue_id!r}")
            cue_ids.add(cue_id)
            if not str(cue.get("text", "")).strip():
                raise ValueError(f"Cue {cue_id} has no narration text")
            if not re.fullmatch(r"[ab][fm]_[a-z]+", str(cue.get("voice", ""))):
                raise ValueError(f"Cue {cue_id} has an unsafe Kokoro voice id")
            pause = int(cue.get("pauseAfterMs", 0))
            if pause < 150 or pause > 1_500:
                raise ValueError(f"Cue {cue_id} has an invalid pause")


def synthesise(pipeline: Any, text: str, voice: str, np: Any) -> Any:
    chunks = []
    for _graphemes, _phonemes, audio in pipeline(text, voice=voice):
        samples = np.asarray(audio, dtype=np.float32).reshape(-1)
        if samples.size:
            chunks.append(samples)
    if not chunks:
        raise RuntimeError(f"Kokoro produced no samples for {voice}")
    return np.concatenate(chunks)


def encode_once(source_wav: Path, target: Path, codec: str, true_peak: float) -> None:
    codec_arguments = {
        "opus": ["-c:a", "libopus", "-b:a", "32k", "-vbr", "on"],
        "aac": ["-c:a", "aac", "-b:a", "48k", "-movflags", "+faststart"],
        "mp3": ["-c:a", "libmp3lame", "-b:a", "56k"],
    }[codec]
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source_wav),
        "-af", f"loudnorm=I={TARGET_LUFS}:LRA=7:TP={true_peak}",
        "-ac", "1", "-ar", "48000",
        *codec_arguments,
        str(target),
    ])


def retry_true_peak(measured_true_peak: float) -> float:
    """Compensate for the exact lossy codec's measured inter-sample overshoot."""
    overshoot = max(0.0, measured_true_peak - RETRY_TRUE_PEAK_TARGET)
    return TARGET_TRUE_PEAK - overshoot


def encode(source_wav: Path, target: Path, codec: str) -> None:
    encode_once(source_wav, target, codec, TARGET_TRUE_PEAK)
    measured = measure_loudness(target)
    if measured["truePeakDbtp"] <= RELEASE_TRUE_PEAK_CEILING:
        return

    adjusted_target = retry_true_peak(measured["truePeakDbtp"])
    log.warning(
        "%s encoded at %.2f dBTP; retrying %s from the lossless stem with a %.2f dBTP target",
        target,
        measured["truePeakDbtp"],
        codec,
        adjusted_target,
    )
    encode_once(source_wav, target, codec, adjusted_target)
    retried = measure_loudness(target)
    if retried["truePeakDbtp"] > RELEASE_TRUE_PEAK_CEILING:
        raise RuntimeError(
            f"{target} still exceeds the {RELEASE_TRUE_PEAK_CEILING:.2f} dBTP true-peak ceiling "
            f"after codec compensation: {retried}"
        )


def probe_duration(path: Path) -> float:
    completed = run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ], capture=True)
    return float(completed.stdout.strip())


def measure_loudness(path: Path) -> dict[str, float]:
    completed = subprocess.run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
        "-af", f"loudnorm=I={TARGET_LUFS}:LRA=7:TP={RELEASE_TRUE_PEAK_CEILING}:print_format=json",
        "-f", "null", "-",
    ], text=True, capture_output=True)
    if completed.returncode != 0:
        raise RuntimeError(f"Loudness probe failed for {path}: {completed.stderr[-1000:]}")
    matches = re.findall(r"\{\s*\"input_i\".*?\}", completed.stderr, re.DOTALL)
    if not matches:
        raise RuntimeError(f"No EBU loudness result for {path}")
    measured = json.loads(matches[-1])
    return {
        "integratedLufs": float(measured["input_i"]),
        "truePeakDbtp": float(measured["input_tp"]),
        "loudnessRangeLu": float(measured["input_lra"]),
    }


def probe_loudness(path: Path) -> dict[str, float]:
    result = measure_loudness(path)
    if not -20.0 <= result["integratedLufs"] <= -16.0:
        raise RuntimeError(f"{path} is outside the -18 LUFS dialogue window: {result}")
    if result["truePeakDbtp"] > RELEASE_TRUE_PEAK_CEILING:
        raise RuntimeError(f"{path} exceeds the true-peak ceiling: {result}")
    if result["loudnessRangeLu"] > 12.0:
        raise RuntimeError(f"{path} has excessive loudness range: {result}")
    return result


def timestamp(seconds: float) -> str:
    milliseconds = max(0, round(seconds * 1000))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1_000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"


def write_vtt(path: Path, cue_ranges: list[dict[str, Any]]) -> None:
    lines = ["WEBVTT", ""]
    for cue in cue_ranges:
        lines.extend([
            cue["cueId"],
            f"{timestamp(cue['startSeconds'])} --> {timestamp(cue['endSeconds'])}",
            f"<v {html.escape(str(cue['speaker']), quote=True)}>{html.escape(str(cue['text']))}",
            "",
        ])
    path.write_text("\n".join(lines), encoding="utf-8")


def produce(job: dict[str, Any], output_root: Path) -> Path:
    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KPipeline

    validate_job(job)
    torch.manual_seed(0)
    torch.set_num_threads(max(1, min(8, os.cpu_count() or 4)))
    pipelines: dict[str, Any] = {}
    for language in sorted({str(cue["voice"])[0] for segment in job["segments"] for cue in segment["cues"]}):
        pipelines[language] = KPipeline(lang_code=language)

    session_id = str(job["sessionId"])
    session_root = output_root / session_id
    session_root.mkdir(parents=True, exist_ok=True)
    segment_media = []
    total_duration = 0.0

    for position, segment in enumerate(job["segments"], start=1):
        log.info("[%s %d/%d] %s", session_id, position, len(job["segments"]), segment["opaqueId"])
        chunks = [np.zeros(round(job["sampleRate"] * 0.20), dtype=np.float32)]
        sample_cursor = len(chunks[0])
        cue_ranges = []
        for cue in segment["cues"]:
            voice = str(cue["voice"])
            speech = synthesise(pipelines[voice[0]], str(cue["text"]), voice, np)
            peak = float(np.max(np.abs(speech)))
            if peak > 1.0:
                speech = speech / peak
            start = sample_cursor / job["sampleRate"]
            chunks.append(speech)
            sample_cursor += speech.size
            end = sample_cursor / job["sampleRate"]
            cue_ranges.append({
                "cueId": cue["id"],
                "speaker": cue["speaker"],
                "text": cue["text"],
                "startSeconds": round(start, 3),
                "endSeconds": round(end, 3),
            })
            silence = np.zeros(round(job["sampleRate"] * cue["pauseAfterMs"] / 1000), dtype=np.float32)
            chunks.append(silence)
            sample_cursor += silence.size

        samples = np.concatenate(chunks)
        stem = str(segment["opaqueId"])
        paths = {
            "opus": session_root / f"{stem}.opus",
            "aac": session_root / f"{stem}.m4a",
            "mp3": session_root / f"{stem}.mp3",
            "captions": session_root / f"{stem}.vtt",
        }
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
            wav = Path(handle.name)
        try:
            sf.write(wav, samples, job["sampleRate"], subtype="PCM_16")
            for codec in ("opus", "aac", "mp3"):
                encode(wav, paths[codec], codec)
        finally:
            wav.unlink(missing_ok=True)
        write_vtt(paths["captions"], cue_ranges)

        durations = {codec: probe_duration(paths[codec]) for codec in ("opus", "aac", "mp3")}
        if max(durations.values()) - min(durations.values()) > 0.12:
            raise RuntimeError(f"Codec duration mismatch for {stem}: {durations}")
        loudness = {codec: probe_loudness(paths[codec]) for codec in ("opus", "aac", "mp3")}
        duration = durations["mp3"]
        total_duration += duration
        relative = lambda path: path.relative_to(output_root).as_posix()
        segment_media.append({
            "id": segment["id"],
            "opaqueId": stem,
            "sourceSceneId": segment["sourceSceneId"],
            "durationSeconds": round(duration, 3),
            "cues": cue_ranges,
            "sources": {
                "opus": relative(paths["opus"]),
                "aac": relative(paths["aac"]),
                "mp3": relative(paths["mp3"]),
                "captions": relative(paths["captions"]),
            },
            "loudness": loudness,
        })

    experience = total_duration + float(job["fixedExperienceSeconds"])
    if not 18 * 60 <= experience <= 22 * 60:
        raise RuntimeError(
            f"{session_id} measures {experience / 60:.2f} minutes with authored interactions; required 18-22"
        )
    manifest = {
        "schema": SESSION_SCHEMA,
        "caseId": job["caseId"],
        "sourceRevision": job["sourceRevision"],
        "releaseTag": job["releaseTag"],
        "sourceDigest": job["sourceDigest"],
        "sessionId": session_id,
        "day": job["day"],
        "fixedExperienceSeconds": job["fixedExperienceSeconds"],
        "narrationSeconds": round(total_duration, 3),
        "experienceSeconds": round(experience, 3),
        "productionEnvironment": {
            "kokoro": importlib.metadata.version("kokoro"),
            "numpy": importlib.metadata.version("numpy"),
            "soundfile": importlib.metadata.version("soundfile"),
            "torch": importlib.metadata.version("torch"),
            "ffmpeg": run(["ffmpeg", "-version"], capture=True).stdout.splitlines()[0],
            "python": sys.version.split()[0],
        },
        "segments": segment_media,
    }
    manifest_path = session_root / "session-media.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return manifest_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate mixed Court Week scene audio")
    parser.add_argument("job", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--validate-only", action="store_true")
    options = parser.parse_args()
    job = json.loads(options.job.read_text(encoding="utf-8"))
    validate_job(job)
    if options.validate_only:
        log.info("Validated %s", options.job)
        return
    manifest = produce(job, options.output)
    log.info("Wrote %s", manifest)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", stream=sys.stdout)
    main()
