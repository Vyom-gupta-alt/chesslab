"""Chunked, resumable uploads for multi-GB match videos.

1. POST /api/uploads                     {filename, size}  -> {upload_id, chunk_size, total_chunks}
2. PUT  /api/uploads/{id}/chunks/{n}     raw bytes of chunk n (any order, retry-safe)
3. GET  /api/uploads/{id}                which chunks the server already has (resume)
4. POST /api/uploads/{id}/complete       assemble -> new video, processing starts
"""

from __future__ import annotations

import math
import shutil
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app import jobs, storage
from app.core.config import get_settings

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

_VIDEO_EXT = {".mp4", ".mov", ".mkv", ".avi", ".m4v", ".webm", ".mts", ".m2ts"}


class UploadInit(BaseModel):
    filename: str
    size: int


def _upload_dir(upload_id: str) -> Path:
    try:
        d = storage.uploads_dir() / storage.safe_id(upload_id)
    except ValueError:
        raise HTTPException(400, "invalid upload id") from None
    if not (d / "upload.json").exists():
        raise HTTPException(404, "upload not found")
    return d


def _received(d: Path) -> list[int]:
    return sorted(int(p.stem) for p in d.glob("*.part"))


@router.post("")
def init_upload(body: UploadInit):
    s = get_settings()
    ext = Path(body.filename).suffix.lower()
    if ext not in _VIDEO_EXT:
        raise HTTPException(400, f"Unsupported file type {ext or '(none)'}; use MP4, MOV, MKV, AVI or WebM")
    if body.size <= 0 or body.size > s.max_upload_gb * 1024 ** 3:
        raise HTTPException(400, f"File must be under {s.max_upload_gb:g} GB")
    chunk = s.upload_chunk_size_mb * 1024 * 1024
    upload_id = storage.new_id()
    d = storage.uploads_dir() / upload_id
    d.mkdir(parents=True)
    info = {"upload_id": upload_id, "filename": Path(body.filename).name, "size": body.size,
            "chunk_size": chunk, "total_chunks": max(1, math.ceil(body.size / chunk)),
            "created_at": time.time()}
    storage.write_json(d / "upload.json", info)
    return info


@router.get("/{upload_id}")
def upload_status(upload_id: str):
    d = _upload_dir(upload_id)
    return {**storage.read_json(d / "upload.json"), "received": _received(d)}


@router.put("/{upload_id}/chunks/{index}")
async def put_chunk(upload_id: str, index: int, request: Request):
    d = _upload_dir(upload_id)
    info = storage.read_json(d / "upload.json")
    if not 0 <= index < info["total_chunks"]:
        raise HTTPException(400, "chunk index out of range")
    expected = min(info["chunk_size"], info["size"] - index * info["chunk_size"])
    tmp = d / f"{index:06d}.tmp"
    written = 0
    with open(tmp, "wb") as fh:
        async for data in request.stream():
            written += len(data)
            if written > expected:
                break
            fh.write(data)
    if written != expected:
        tmp.unlink(missing_ok=True)
        raise HTTPException(400, f"chunk {index}: expected {expected} bytes, got {written}")
    tmp.replace(d / f"{index:06d}.part")          # only complete chunks count
    return {"index": index, "received": written}


@router.post("/{upload_id}/complete")
def complete_upload(upload_id: str):
    d = _upload_dir(upload_id)
    info = storage.read_json(d / "upload.json")
    missing = sorted(set(range(info["total_chunks"])) - set(_received(d)))
    if missing:
        raise HTTPException(409, {"message": "missing chunks", "missing": missing[:50]})

    video_id = storage.new_id()
    vdir = storage.video_dir(video_id)
    vdir.mkdir(parents=True)
    dest = vdir / f"source{Path(info['filename']).suffix.lower()}"
    with open(dest, "wb") as out:
        for i in range(info["total_chunks"]):
            with open(d / f"{i:06d}.part", "rb") as part:
                shutil.copyfileobj(part, out, 8 * 1024 * 1024)
    if dest.stat().st_size != info["size"]:
        shutil.rmtree(vdir, ignore_errors=True)
        raise HTTPException(500, "assembled file has the wrong size")
    shutil.rmtree(d, ignore_errors=True)

    storage.write_json(vdir / "meta.json", {"id": video_id, "filename": info["filename"],
                                            "size": info["size"], "created_at": time.time()})
    jobs.submit(video_id)
    return {"video_id": video_id}
