"""File-system storage. One folder per video:

storage/videos/<id>/
    source.<ext>        original upload
    meta.json           filename, size, duration, fps ...
    job.json            processing status / progress
    analysis.json       rallies, strokes, clips (no skeletons)
    skeletons.json      per-stroke 2D tracks for the overlay
    pose.npz            per-stroke 3D landmarks (for pro comparison)
    clips/rally_000.mp4 individual rally clips
    highlights.mp4      rally-only continuous video
"""

from __future__ import annotations

import json
import os
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

from app.core.config import get_settings


def videos_dir() -> Path:
    d = get_settings().storage_dir / "videos"
    d.mkdir(parents=True, exist_ok=True)
    return d


def uploads_dir() -> Path:
    d = get_settings().storage_dir / "uploads"
    d.mkdir(parents=True, exist_ok=True)
    return d


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def safe_id(value: str) -> str:
    if not value.isalnum() or len(value) > 64:
        raise ValueError("invalid id")
    return value


def video_dir(video_id: str) -> Path:
    return videos_dir() / safe_id(video_id)


def source_path(video_id: str) -> Path | None:
    d = video_dir(video_id)
    for p in d.glob("source.*"):
        return p
    return None


def read_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_json(path: Path, data: Any) -> None:
    """Atomic write so readers (SSE stream) never see half a file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    with os.fdopen(fd, "w") as fh:
        json.dump(data, fh)
    os.replace(tmp, path)


def update_job(video_id: str, **fields: Any) -> dict[str, Any]:
    path = video_dir(video_id) / "job.json"
    job = read_json(path, {}) or {}
    job.update(fields, updated_at=time.time())
    write_json(path, job)
    return job


def list_videos() -> list[dict[str, Any]]:
    out = []
    for d in sorted(videos_dir().iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        meta = read_json(d / "meta.json")
        if meta:
            out.append({**meta, "job": read_json(d / "job.json", {})})
    return out
