"""Shared Qwen3-TTS load helpers for narration CI scripts.

Prefetch full Hub snapshots before from_pretrained so Actions HF caches with
incomplete speech_tokenizer trees cannot fail mid-load.
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

import torch

log = logging.getLogger("qwen-tts-load")

SPEECH_TOKENIZER_MARKERS = (
    "speech_tokenizer/preprocessor_config.json",
    "speech_tokenizer/config.json",
)


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


def _snapshot_complete(root: Path) -> bool:
    return all((root / marker).is_file() for marker in SPEECH_TOKENIZER_MARKERS)


def prefetch_qwen_model(model_id: str) -> Path:
    """Download (or repair) a full Hub snapshot, then return its local path."""
    from huggingface_hub import snapshot_download

    def _download(*, force: bool) -> Path:
        kwargs: dict = {"repo_id": model_id}
        if force:
            # Drop a broken local snapshot so Hub re-fetches missing tokenizer files.
            kwargs["force_download"] = True
        path = Path(snapshot_download(**kwargs))
        return path

    path = _download(force=False)
    if _snapshot_complete(path):
        log.info("Hub snapshot ready: %s -> %s", model_id, path)
        return path

    log.warning(
        "Incomplete Hub snapshot for %s (missing speech_tokenizer markers); re-downloading",
        model_id,
    )
    # Incomplete Actions caches often leave a half-filled snapshot directory.
    if path.is_dir():
        shutil.rmtree(path, ignore_errors=True)
    path = _download(force=True)
    if not _snapshot_complete(path):
        missing = [m for m in SPEECH_TOKENIZER_MARKERS if not (path / m).is_file()]
        raise FileNotFoundError(
            f"Qwen snapshot still incomplete after re-download ({model_id}): missing {missing}"
        )
    log.info("Repaired Hub snapshot: %s -> %s", model_id, path)
    return path


def load_qwen_model(model_id: str, device: str):
    """Prefetch a complete snapshot, then load Qwen3TTSModel from that path."""
    from qwen_tts import Qwen3TTSModel

    local_path = prefetch_qwen_model(model_id)
    log.info("Loading %s from %s", model_id, local_path)
    return Qwen3TTSModel.from_pretrained(str(local_path), **model_kwargs(device))
