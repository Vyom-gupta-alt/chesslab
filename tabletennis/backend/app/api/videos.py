"""Videos: list, status (SSE), analysis JSON, media, clips, delete, reprocess."""

from __future__ import annotations

import asyncio
import json
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app import jobs, storage
from app.api.media import range_response

router = APIRouter(prefix="/api/videos", tags=["videos"])


def _dir(video_id: str) -> Path:
    try:
        d = storage.video_dir(video_id)
    except ValueError:
        raise HTTPException(400, "invalid video id") from None
    if not (d / "meta.json").exists():
        raise HTTPException(404, "video not found")
    return d


@router.get("")
def list_videos():
    return storage.list_videos()


@router.get("/{video_id}")
def get_video(video_id: str):
    d = _dir(video_id)
    meta = storage.read_json(d / "meta.json", {})
    return {**meta, "job": storage.read_json(d / "job.json", {}),
            "has_highlights": (d / "highlights.mp4").exists()}


@router.get("/{video_id}/events")
async def job_events(video_id: str, request: Request):
    """Server-Sent Events stream of the processing job until it finishes."""
    d = _dir(video_id)

    async def stream():
        last = None
        while True:
            if await request.is_disconnected():
                return
            job = storage.read_json(d / "job.json", {}) or {}
            payload = json.dumps(job)
            if payload != last:
                last = payload
                yield f"data: {payload}\n\n"
            else:
                yield ": keep-alive\n\n"
            if job.get("status") in ("done", "failed"):
                return
            await asyncio.sleep(0.5)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/{video_id}/analysis")
def get_analysis(video_id: str):
    data = storage.read_json(_dir(video_id) / "analysis.json")
    if data is None:
        raise HTTPException(404, "analysis not ready")
    return data


@router.get("/{video_id}/export")
def export_analysis(video_id: str):
    data = get_analysis(video_id)
    return JSONResponse(data, headers={"Content-Disposition": f'attachment; filename="tt-analysis-{video_id}.json"'})


@router.get("/{video_id}/skeletons/{key}")
def get_skeleton(video_id: str, key: str):
    skel = storage.read_json(_dir(video_id) / "skeletons.json", {}) or {}
    if key not in skel:
        raise HTTPException(404, "no skeleton for that stroke")
    return skel[key]


@router.get("/{video_id}/source")
def source(video_id: str, request: Request):
    _dir(video_id)
    path = storage.source_path(video_id)
    if path is None:
        raise HTTPException(404, "source missing")
    return range_response(request, path)


@router.get("/{video_id}/highlights")
def highlights(video_id: str, request: Request, download: bool = False):
    path = _dir(video_id) / "highlights.mp4"
    return range_response(request, path, f"rallies-{video_id}.mp4" if download else None)


@router.get("/{video_id}/clips/{index}")
def clip(video_id: str, index: int, request: Request, download: bool = False):
    path = _dir(video_id) / "clips" / f"rally_{index:03d}.mp4"
    return range_response(request, path, f"rally-{index + 1:03d}.mp4" if download else None)


@router.post("/{video_id}/reprocess")
def reprocess(video_id: str):
    d = _dir(video_id)
    if (storage.read_json(d / "job.json", {}) or {}).get("status") in ("queued", "running"):
        raise HTTPException(409, "already processing")
    jobs.submit(video_id)
    return {"ok": True}


@router.delete("/{video_id}")
def delete_video(video_id: str):
    d = _dir(video_id)
    if (storage.read_json(d / "job.json", {}) or {}).get("status") == "running":
        raise HTTPException(409, "still processing")
    shutil.rmtree(d)
    return {"ok": True}
