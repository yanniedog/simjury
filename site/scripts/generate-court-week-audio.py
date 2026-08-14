"""Produce one mixed prerecorded file per authored Court Week audio segment.

The input is a deterministic reviewed job emitted by
``site/app/scripts/court-week-audio-jobs.ts``. Kokoro runs only here, in a
trusted GitHub Actions production job; browsers never invoke an AI service.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import importlib.metadata
import json
import logging
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Callable

log = logging.getLogger("court-week-audio")
JOB_SCHEMA_V1 = "simjury.court-week-audio-job/v1"
JOB_SCHEMA_V2 = "simjury.court-week-audio-job/v2"
SUPPORTED_JOB_SCHEMAS = {JOB_SCHEMA_V1, JOB_SCHEMA_V2}
SESSION_SCHEMA = "simjury.court-week-session-media/v1"
TARGET_LUFS = -18.0
TARGET_TRUE_PEAK = -1.5
RELEASE_TRUE_PEAK_CEILING = -0.5
RETRY_TRUE_PEAK_TARGET = -1.25
RELEASE_MIN_LUFS = -20.0
RELEASE_MAX_LUFS = -16.0
RELEASE_MAX_LRA = 12.0
MAX_CODEC_ENCODE_ATTEMPTS = 3
CODEC_ARGUMENTS = {
    "opus": ["-c:a", "libopus", "-b:a", "64k", "-vbr", "on"],
    "aac": ["-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart"],
    # Match the high-quality LAME VBR contract used by Daily Docket.
    "mp3": ["-c:a", "libmp3lame", "-q:a", "2"],
}
# Keep the per-pass LUFS correction bound to the remaining retry budget so a
# misconfigured attempt count cannot outrun the adjustment ceiling.
MAX_LUFS_ADJUSTMENT = float(MAX_CODEC_ENCODE_ATTEMPTS - 1)
KOKORO_REPOSITORY = "hexgrad/Kokoro-82M"
KOKORO_REVISION = "f3ff3571791e39611d31c381e3a41a3af07b4987"
KOKORO_CONFIG = "config.json"
KOKORO_MODEL = "kokoro-v1_0.pth"
HUGGINGFACE_DOWNLOAD_ATTEMPTS = 4
HUGGINGFACE_RETRY_BASE_SECONDS = 5.0
HUGGINGFACE_RETRY_MAX_SECONDS = 30.0
PINNED_PYTHON_PACKAGES = {
    "kokoro": "0.9.4",
    "soundfile": "0.13.1",
    "numpy": "2.4.6",
    "torch": "2.13.0",
    "misaki": "0.9.4",
    "huggingface_hub": "1.26.0",
    "hf_transfer": "0.1.9",
}


def run(command: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=True,
        text=True,
        capture_output=capture,
    )


def require_pinned_python_packages() -> dict[str, str]:
    actual: dict[str, str] = {}
    missing: dict[str, dict[str, str | None]] = {}
    for name, expected in PINNED_PYTHON_PACKAGES.items():
        try:
            actual[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            missing[name] = {"expected": expected, "actual": None}
    if missing:
        raise RuntimeError(
            f"Court Week synthesis dependencies are missing: {json.dumps(missing, sort_keys=True)}"
        )
    drift = {
        name: {"expected": expected, "actual": actual[name]}
        for name, expected in PINNED_PYTHON_PACKAGES.items()
        if actual[name] != expected
    }
    if drift:
        raise RuntimeError(f"Court Week synthesis dependency drift: {json.dumps(drift, sort_keys=True)}")
    return actual


def sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def exception_chain(error: BaseException) -> list[BaseException]:
    chain = []
    seen: set[int] = set()
    current: BaseException | None = error
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        chain.append(current)
        current = current.__cause__ or current.__context__
    return chain


def is_transient_huggingface_error(error: BaseException) -> bool:
    """Return true only for failures that a fresh Hub request may recover from."""
    errors = exception_chain(error)
    message = " ".join(str(item).lower() for item in errors)
    permanent_markers = (
        "checksum mismatch",
        "hash mismatch",
        "consistency check failed",
        "revision not found",
        "repository not found",
        "entry not found",
        "unauthorized",
        "forbidden",
    )
    if any(marker in message for marker in permanent_markers):
        return False

    statuses = []
    for item in errors:
        status = getattr(item, "status_code", None)
        response = getattr(item, "response", None)
        if status is None and response is not None:
            status = getattr(response, "status_code", None)
        if isinstance(status, int):
            statuses.append(status)
    if statuses:
        return any(status in {408, 425, 429} or status >= 500 for status in statuses)

    transient_markers = (
        "408 request timeout",
        "425 too early",
        "429 too many requests",
        "500 internal server error",
        "502 bad gateway",
        "503 service unavailable",
        "504 gateway timeout",
        "timed out",
        "timeout",
        "temporarily unavailable",
        "connection reset",
        "connection aborted",
        "connection refused",
        "remote end closed connection",
        "server disconnected",
        "incomplete read",
        "network is unreachable",
        "name resolution",
        "ssl eof",
        "cas service error",
    )
    return any(marker in message for marker in transient_markers)


def download_huggingface_asset(
    download: Callable[..., str],
    filename: str,
    *,
    sleep: Callable[[float], None] = time.sleep,
) -> str:
    """Download one pinned Kokoro asset with bounded transient retries."""
    for attempt in range(1, HUGGINGFACE_DOWNLOAD_ATTEMPTS + 1):
        try:
            return download(
                repo_id=KOKORO_REPOSITORY,
                revision=KOKORO_REVISION,
                filename=filename,
            )
        except Exception as error:
            if attempt >= HUGGINGFACE_DOWNLOAD_ATTEMPTS or not is_transient_huggingface_error(error):
                raise
            delay = min(
                HUGGINGFACE_RETRY_BASE_SECONDS * (2 ** (attempt - 1)),
                HUGGINGFACE_RETRY_MAX_SECONDS,
            )
            log.warning(
                "Transient Hugging Face download failure for %s (attempt %d/%d); retrying in %.0fs: %s",
                filename,
                attempt,
                HUGGINGFACE_DOWNLOAD_ATTEMPTS,
                delay,
                error,
            )
            sleep(delay)
    raise AssertionError("unreachable")


def validate_job(job: dict[str, Any]) -> None:
    schema = job.get("schema")
    if schema not in SUPPORTED_JOB_SCHEMAS:
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
    opaque_ids: set[str] = set()
    cue_ids: set[str] = set()
    caption_ids: set[str] = set()
    turn_ids: set[str] = set()
    utterance_ids: set[str] = set()
    for segment in segments:
        opaque_id = str(segment.get("opaqueId", ""))
        if not re.fullmatch(r"[0-9a-f]{32}", opaque_id) or opaque_id in opaque_ids:
            raise ValueError(f"Invalid or duplicate opaque segment id: {opaque_id!r}")
        opaque_ids.add(opaque_id)
        if schema == JOB_SCHEMA_V1:
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
                validate_pause(cue.get("pauseAfterMs", 0), f"Cue {cue_id}")
            continue

        captions = segment.get("captions")
        utterances = segment.get("utterances")
        if not isinstance(captions, list) or not captions:
            raise ValueError(f"Audio segment {opaque_id} has no display captions")
        if not isinstance(utterances, list) or not utterances:
            raise ValueError(f"Audio segment {opaque_id} has no performance utterances")
        caption_turns = []
        for caption in captions:
            caption_id = str(caption.get("id", ""))
            if not caption_id or caption_id in caption_ids:
                raise ValueError(f"Missing or duplicate caption id: {caption_id!r}")
            caption_ids.add(caption_id)
            if not str(caption.get("sourceCueId", "")).strip():
                raise ValueError(f"Caption {caption_id} has no authored source cue id")
            if not str(caption.get("speaker", "")).strip() or not str(caption.get("text", "")).strip():
                raise ValueError(f"Caption {caption_id} has incomplete display text")
            turns = caption.get("turns")
            if not isinstance(turns, list) or not turns:
                raise ValueError(f"Caption {caption_id} has no spoken turns")
            for turn in turns:
                turn_id = str(turn.get("id", ""))
                if not turn_id or turn_id in turn_ids:
                    raise ValueError(f"Missing or duplicate caption turn id: {turn_id!r}")
                turn_ids.add(turn_id)
                if not str(turn.get("speaker", "")).strip() or not str(turn.get("text", "")).strip():
                    raise ValueError(f"Caption turn {turn_id} is incomplete")
                utterance_id = str(turn.get("utteranceId", ""))
                if not utterance_id:
                    raise ValueError(f"Caption turn {turn_id} has no performance utterance")
                caption_turns.append((caption_id, turn_id, str(turn["text"]), utterance_id))

        utterance_parts = []
        for utterance in utterances:
            utterance_id = str(utterance.get("id", ""))
            if not utterance_id or utterance_id in utterance_ids:
                raise ValueError(f"Missing or duplicate performance utterance id: {utterance_id!r}")
            utterance_ids.add(utterance_id)
            text = str(utterance.get("text", "")).strip()
            if not text:
                raise ValueError(f"Performance utterance {utterance_id} has no narration text")
            if not re.fullmatch(r"[ab][fm]_[a-z]+", str(utterance.get("voice", ""))):
                raise ValueError(f"Performance utterance {utterance_id} has an unsafe Kokoro voice id")
            parts = utterance.get("parts")
            if not isinstance(parts, list) or not parts:
                raise ValueError(f"Performance utterance {utterance_id} has no caption parts")
            if " ".join(str(part.get("text", "")).strip() for part in parts) != text:
                raise ValueError(f"Performance utterance {utterance_id} does not reconstruct from its caption parts")
            for part in parts:
                utterance_parts.append((
                    str(part.get("captionId", "")),
                    str(part.get("turnId", "")),
                    str(part.get("text", "")),
                    utterance_id,
                ))
            validate_pause(utterance.get("pauseAfterMs", 0), f"Performance utterance {utterance_id}")
        if caption_turns != utterance_parts:
            raise ValueError(f"Audio segment {opaque_id} caption/utterance coverage or order differs")


def validate_pause(pause: Any, label: str) -> None:
    if isinstance(pause, bool) or not isinstance(pause, int):
        raise ValueError(f"{label} has a non-integer pause")
    if pause != 0 and (pause < 150 or pause > 1_500):
        raise ValueError(f"{label} has an invalid pause")


def synthesise(pipeline: Any, text: str, voice: str, np: Any, torch: Any) -> Any:
    chunks = []
    with torch.inference_mode():
        for _graphemes, _phonemes, audio in pipeline(text, voice=voice):
            samples = np.asarray(audio, dtype=np.float32).reshape(-1)
            if samples.size:
                chunks.append(samples)
    if not chunks:
        raise RuntimeError(f"Kokoro produced no samples for {voice}")
    return np.concatenate(chunks)


def synthesise_timed(
    pipeline: Any,
    text: str,
    voice: str,
    sample_rate: int,
    np: Any,
    torch: Any,
) -> dict[str, Any]:
    """Render one complete performance while retaining Kokoro token timing."""
    chunks = []
    timed_tokens = []
    character_cursor = 0
    sample_cursor = 0
    with torch.inference_mode():
        for result in pipeline(text, voice=voice):
            samples = np.asarray(result.audio, dtype=np.float32).reshape(-1)
            if samples.size:
                chunks.append(samples)
            if not result.tokens:
                raise RuntimeError(f"Kokoro returned no token timings for {voice}")
            chunk_seconds = sample_cursor / sample_rate
            chunk_duration = samples.size / sample_rate
            for token in result.tokens:
                piece = f"{token.text or ''}{token.whitespace or ''}"
                token_start = character_cursor
                character_cursor += len(piece)
                start_ts = None if token.start_ts is None else chunk_seconds + float(token.start_ts)
                end_ts = None if token.end_ts is None else chunk_seconds + float(token.end_ts)
                if start_ts is not None and end_ts is not None:
                    start_ts = max(chunk_seconds, min(start_ts, chunk_seconds + chunk_duration))
                    end_ts = max(start_ts, min(end_ts, chunk_seconds + chunk_duration))
                timed_tokens.append({
                    "text": piece,
                    "characterStart": token_start,
                    "characterEnd": character_cursor,
                    "startSeconds": start_ts,
                    "endSeconds": end_ts,
                })
            sample_cursor += samples.size
    if not chunks:
        raise RuntimeError(f"Kokoro produced no samples for {voice}")
    samples = np.concatenate(chunks)
    rendered_text = "".join(token["text"] for token in timed_tokens)
    leading = len(rendered_text) - len(rendered_text.lstrip())
    rendered_text = rendered_text.strip()
    for token in timed_tokens:
        token["characterStart"] -= leading
        token["characterEnd"] -= leading
    return {"samples": samples, "text": rendered_text, "tokens": timed_tokens}


def align_utterance_parts(
    synthesis: dict[str, Any],
    utterance: dict[str, Any],
    sample_rate: int,
) -> list[dict[str, Any]]:
    """Map reviewed caption parts onto exact, monotonic token boundaries."""
    parts = utterance["parts"]
    expected_text = " ".join(str(part["text"]).strip() for part in parts)
    if synthesis["text"] != expected_text or str(utterance["text"]).strip() != expected_text:
        raise RuntimeError(f"Kokoro token text does not reconstruct {utterance['id']}")

    part_ranges = []
    character_cursor = 0
    for index, part in enumerate(parts):
        if index:
            if synthesis["text"][character_cursor: character_cursor + 1] != " ":
                raise RuntimeError(f"Kokoro token boundary differs before {part['turnId']}")
            character_cursor += 1
        part_text = str(part["text"]).strip()
        start_character = character_cursor
        end_character = start_character + len(part_text)
        if synthesis["text"][start_character:end_character] != part_text:
            raise RuntimeError(f"Kokoro token text differs for {part['turnId']}")
        character_cursor = end_character
        tokens = [token for token in synthesis["tokens"] if (
            token["characterStart"] < end_character and
            token["characterEnd"] > start_character and
            token["startSeconds"] is not None and
            token["endSeconds"] is not None
        )]
        if not tokens:
            raise RuntimeError(f"Kokoro returned no spoken timing for {part['turnId']}")
        part_ranges.append({
            **part,
            "startSeconds": min(token["startSeconds"] for token in tokens),
            "endSeconds": max(token["endSeconds"] for token in tokens),
        })
    if character_cursor != len(synthesis["text"]):
        raise RuntimeError(f"Kokoro left unmatched token text in {utterance['id']}")

    duration = synthesis["samples"].size / sample_rate
    part_ranges[0]["startSeconds"] = 0.0
    part_ranges[-1]["endSeconds"] = duration
    for index in range(len(part_ranges) - 1):
        left = part_ranges[index]
        right = part_ranges[index + 1]
        boundary = (float(left["endSeconds"]) + float(right["startSeconds"])) / 2
        if not left["startSeconds"] < boundary < right["endSeconds"]:
            raise RuntimeError(f"Non-monotonic Kokoro token boundary in {utterance['id']}")
        left["endSeconds"] = boundary
        right["startSeconds"] = boundary
    return part_ranges


def encode_once(
    source_wav: Path,
    target: Path,
    codec: str,
    integrated_lufs: float,
    true_peak: float,
) -> None:
    codec_arguments = CODEC_ARGUMENTS[codec]
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source_wav),
        "-af", f"loudnorm=I={integrated_lufs}:LRA=7:TP={true_peak}",
        "-ac", "1", "-ar", "48000",
        *codec_arguments,
        str(target),
    ])


def retry_true_peak(current_target: float, measured_true_peak: float) -> float:
    """Compensate for the exact lossy codec's measured inter-sample overshoot."""
    overshoot = max(0.0, measured_true_peak - RETRY_TRUE_PEAK_TARGET)
    return current_target - overshoot


def retry_integrated_lufs(current_target: float, measured_lufs: float) -> float:
    if RELEASE_MIN_LUFS <= measured_lufs <= RELEASE_MAX_LUFS:
        return current_target
    correction = TARGET_LUFS - measured_lufs
    bounded = max(-MAX_LUFS_ADJUSTMENT, min(MAX_LUFS_ADJUSTMENT, correction))
    return current_target + bounded


def release_loudness_ready(measured: dict[str, float]) -> bool:
    return (
        RELEASE_MIN_LUFS <= measured["integratedLufs"] <= RELEASE_MAX_LUFS
        and measured["truePeakDbtp"] <= RELEASE_TRUE_PEAK_CEILING
        and measured["loudnessRangeLu"] <= RELEASE_MAX_LRA
    )


def encode(source_wav: Path, target: Path, codec: str) -> None:
    if MAX_CODEC_ENCODE_ATTEMPTS < 1:
        raise AssertionError(
            f"MAX_CODEC_ENCODE_ATTEMPTS must be >= 1 (got {MAX_CODEC_ENCODE_ATTEMPTS})"
        )
    integrated_target = TARGET_LUFS
    normalization_target = TARGET_TRUE_PEAK
    measured: dict[str, float] | None = None
    for attempt in range(1, MAX_CODEC_ENCODE_ATTEMPTS + 1):
        encode_once(source_wav, target, codec, integrated_target, normalization_target)
        measured = measure_loudness(target)
        if release_loudness_ready(measured):
            return
        if attempt == MAX_CODEC_ENCODE_ATTEMPTS:
            break
        next_target = retry_true_peak(normalization_target, measured["truePeakDbtp"])
        next_integrated = retry_integrated_lufs(integrated_target, measured["integratedLufs"])
        log.warning(
            "%s measured %.2f LUFS / %.2f dBTP on pass %d; retrying %s from the "
            "lossless stem with %.2f LUFS / %.2f dBTP targets",
            target,
            measured["integratedLufs"],
            measured["truePeakDbtp"],
            attempt,
            codec,
            next_integrated,
            next_target,
        )
        integrated_target = next_integrated
        normalization_target = next_target

    if measured is None:
        raise AssertionError(
            "Codec encode loop completed without measuring an output "
            f"(MAX_CODEC_ENCODE_ATTEMPTS={MAX_CODEC_ENCODE_ATTEMPTS})"
        )
    raise RuntimeError(
        f"{target} is still outside the {RELEASE_MIN_LUFS:.1f} to {RELEASE_MAX_LUFS:.1f} LUFS, "
        f"{RELEASE_TRUE_PEAK_CEILING:.1f} dBTP, {RELEASE_MAX_LRA:.1f} LU release contract "
        f"after {MAX_CODEC_ENCODE_ATTEMPTS} codec passes: {measured}"
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
    if not RELEASE_MIN_LUFS <= result["integratedLufs"] <= RELEASE_MAX_LUFS:
        raise RuntimeError(
            f"{path} is outside the {RELEASE_MIN_LUFS:.1f} to {RELEASE_MAX_LUFS:.1f} LUFS "
            f"dialogue window: {result}"
        )
    if result["truePeakDbtp"] > RELEASE_TRUE_PEAK_CEILING:
        raise RuntimeError(
            f"{path} exceeds the {RELEASE_TRUE_PEAK_CEILING:.1f} dBTP true-peak ceiling: {result}"
        )
    if result["loudnessRangeLu"] > RELEASE_MAX_LRA:
        raise RuntimeError(f"{path} exceeds the {RELEASE_MAX_LRA:.1f} LU loudness range: {result}")
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
    from huggingface_hub import hf_hub_download
    from kokoro import KModel, KPipeline

    validate_job(job)
    pinned_packages = require_pinned_python_packages()
    torch.manual_seed(0)
    torch.set_num_threads(max(1, min(8, os.cpu_count() or 4)))
    config_path = download_huggingface_asset(hf_hub_download, KOKORO_CONFIG)
    model_path = download_huggingface_asset(hf_hub_download, KOKORO_MODEL)
    model = KModel(
        repo_id=KOKORO_REPOSITORY,
        config=config_path,
        model=model_path,
    ).to("cpu").eval()
    performance_items = [
        item
        for segment in job["segments"]
        for item in (segment["cues"] if job["schema"] == JOB_SCHEMA_V1 else segment["utterances"])
    ]
    pipelines: dict[str, Any] = {}
    for language in sorted({str(item["voice"])[0] for item in performance_items}):
        pipelines[language] = KPipeline(
            lang_code=language,
            repo_id=KOKORO_REPOSITORY,
            model=model,
            device="cpu",
        )
    voices = {
        voice: download_huggingface_asset(hf_hub_download, f"voices/{voice}.pt")
        for voice in sorted({str(item["voice"]) for item in performance_items})
    }

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
        if job["schema"] == JOB_SCHEMA_V1:
            for cue in segment["cues"]:
                voice = str(cue["voice"])
                speech = synthesise(pipelines[voice[0]], str(cue["text"]), voices[voice], np, torch)
                peak = float(np.max(np.abs(speech)))
                if peak > 1.0:
                    speech = speech / peak
                start = sample_cursor / job["sampleRate"]
                chunks.append(speech)
                sample_cursor += speech.size
                end = sample_cursor / job["sampleRate"]
                cue_ranges.append({
                    "cueId": cue["id"],
                    "sourceCueId": str(cue.get("sourceCueId") or cue["id"]),
                    "speaker": cue["speaker"],
                    "text": cue["text"],
                    "startSeconds": round(start, 3),
                    "endSeconds": round(end, 3),
                })
                silence = np.zeros(round(job["sampleRate"] * cue["pauseAfterMs"] / 1000), dtype=np.float32)
                chunks.append(silence)
                sample_cursor += silence.size
        else:
            caption_ranges = {
                caption["id"]: {
                    "cueId": caption["id"],
                    "sourceCueId": caption["sourceCueId"],
                    "speaker": caption["speaker"],
                    "text": caption["text"],
                    "startSeconds": None,
                    "endSeconds": None,
                    "turns": [],
                }
                for caption in segment["captions"]
            }
            for utterance in segment["utterances"]:
                voice = str(utterance["voice"])
                synthesis = synthesise_timed(
                    pipelines[voice[0]],
                    str(utterance["text"]),
                    voices[voice],
                    job["sampleRate"],
                    np,
                    torch,
                )
                speech = synthesis["samples"]
                peak = float(np.max(np.abs(speech)))
                if peak > 1.0:
                    speech = speech / peak
                utterance_start = sample_cursor / job["sampleRate"]
                part_ranges = align_utterance_parts(synthesis, utterance, job["sampleRate"])
                chunks.append(speech)
                sample_cursor += speech.size
                for part in part_ranges:
                    caption = caption_ranges.get(part["captionId"])
                    if caption is None:
                        raise RuntimeError(f"Unknown caption {part['captionId']} in {utterance['id']}")
                    start = utterance_start + float(part["startSeconds"])
                    end = utterance_start + float(part["endSeconds"])
                    caption["startSeconds"] = start if caption["startSeconds"] is None else min(caption["startSeconds"], start)
                    caption["endSeconds"] = end if caption["endSeconds"] is None else max(caption["endSeconds"], end)
                    caption["turns"].append({
                        "turnId": part["turnId"],
                        "startSeconds": round(start, 3),
                        "endSeconds": round(end, 3),
                    })
                silence = np.zeros(round(job["sampleRate"] * utterance["pauseAfterMs"] / 1000), dtype=np.float32)
                chunks.append(silence)
                sample_cursor += silence.size

            for caption_source in segment["captions"]:
                caption = caption_ranges[caption_source["id"]]
                expected_turns = [turn["id"] for turn in caption_source["turns"]]
                actual_turns = [turn["turnId"] for turn in caption["turns"]]
                if caption["startSeconds"] is None or caption["endSeconds"] is None or actual_turns != expected_turns:
                    raise RuntimeError(f"Incomplete timed caption {caption_source['id']}")
                if not caption["startSeconds"] < caption["endSeconds"]:
                    raise RuntimeError(f"Non-monotonic timed caption {caption_source['id']}")
                caption["startSeconds"] = round(caption["startSeconds"], 3)
                caption["endSeconds"] = round(caption["endSeconds"], 3)
                cue_ranges.append(caption)

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

    if float(job["fixedExperienceSeconds"]) != 0:
        raise RuntimeError(f"{session_id} must not add fixed interaction time")
    experience = total_duration
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
            **pinned_packages,
            "kokoroRepository": KOKORO_REPOSITORY,
            "kokoroRevision": KOKORO_REVISION,
            "kokoroConfigSha256": sha256_file(config_path),
            "kokoroModelSha256": sha256_file(model_path),
            "ffmpeg": run(["ffmpeg", "-version"], capture=True).stdout.splitlines()[0],
            "espeakNg": run(["espeak-ng", "--version"], capture=True).stdout.splitlines()[0],
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
