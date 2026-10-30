"""Thin FFmpeg helpers: probe a file and pull its audio as a numpy array."""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np


@dataclass
class MediaInfo:
    duration: float
    fps: float
    width: int
    height: int
    has_audio: bool


def _require(binary: str) -> str:
    path = shutil.which(binary)
    if path is None:
        raise RuntimeError(f"{binary} not found on PATH; install FFmpeg")
    return path


def probe(path: str | Path) -> MediaInfo:
    out = subprocess.run(
        [_require("ffprobe"), "-v", "error", "-print_format", "json",
         "-show_streams", "-show_format", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout
    meta = json.loads(out)
    video = next((s for s in meta["streams"] if s.get("codec_type") == "video"), None)
    if video is None:
        raise ValueError(f"No video stream in {path}")
    num, _, den = video.get("avg_frame_rate", "0/1").partition("/")
    fps = float(num) / float(den or 1) if float(den or 1) else 0.0
    duration = float(meta.get("format", {}).get("duration") or video.get("duration") or 0.0)
    return MediaInfo(
        duration=duration,
        fps=fps or 30.0,
        width=int(video["width"]),
        height=int(video["height"]),
        has_audio=any(s.get("codec_type") == "audio" for s in meta["streams"]),
    )


def load_audio(path: str | Path, sample_rate: int = 22050) -> np.ndarray:
    """Decode the first audio stream to mono float32 in [-1, 1]."""
    proc = subprocess.run(
        [_require("ffmpeg"), "-v", "error", "-i", str(path), "-vn", "-ac", "1",
         "-ar", str(sample_rate), "-f", "f32le", "-"],
        check=True, capture_output=True,
    )
    return np.frombuffer(proc.stdout, dtype=np.float32).copy()
