"""Pro reference library and stroke comparison.

GET    /api/pros                      library entries
POST   /api/pros                      save one of your analysed strokes as a reference
DELETE /api/pros/{id}
GET    /api/compare/suggest           best-matching references for a stroke
POST   /api/compare                   full comparison (score, metrics, cues, aligned tracks)
"""

from __future__ import annotations

import re
import threading
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import storage
from app.core.config import get_settings

router = APIRouter(tags=["pros"])

_lock = threading.Lock()
_cache: dict[str, Any] = {"stamp": None, "lib": None}


# ------------------------------------------------------------------ helpers
def _pros_dir() -> Path:
    d = get_settings().pros_dir
    d.mkdir(parents=True, exist_ok=True)
    return d


def seed_demo_library() -> None:
    from ttvision.demo import write_demo_library

    if get_settings().seed_demo_pros and not any(_pros_dir().glob("*.json")):
        write_demo_library(_pros_dir())


def library():
    """ProLibrary, reloaded when files in the folder change."""
    from ttvision.matching.pro_matcher import ProLibrary

    d = _pros_dir()
    stamp = tuple(sorted((p.name, p.stat().st_mtime) for p in d.glob("*.json")))
    with _lock:
        if _cache["stamp"] != stamp:
            _cache["lib"], _cache["stamp"] = ProLibrary.load(d), stamp
        return _cache["lib"]


def _user_stroke(video_id: str, key: str):
    """Rebuild the StrokeAnalysis of one analysed stroke from pose.npz."""
    from ttvision.pose.analyzer import PoseAnalyzer, PoseSequence

    try:
        path = storage.video_dir(video_id) / "pose.npz"
    except ValueError:
        raise HTTPException(400, "invalid video id") from None
    if not path.exists():
        raise HTTPException(404, "no pose data for this video (was pose analysis available?)")
    k = key.replace(":", "_")
    with np.load(path) as z:
        if f"{k}__world" not in z:
            raise HTTPException(404, "stroke not found")
        times, world, image, info = z[f"{k}__times"], z[f"{k}__world"], z[f"{k}__image"], z[f"{k}__info"]
    seq = PoseSequence(times.astype(float), world, image, np.ones(len(times), bool))
    seq.image[:, :, 2] = np.maximum(seq.image[:, :, 2], 0.6)   # cleaned already; don't drop frames
    hand = "right" if info[1] > 0.5 else "left"
    return PoseAnalyzer().analyze_single(seq, float(info[0]), hand), seq


def _overlay_track(a) -> list:
    """World skeleton turned to face the viewer (using the stance at the start),
    mirrored for left-handers, as (T, 33, 2) metres. Camera-independent."""
    from ttvision.pose import kinematics as K

    w = a.world.astype(float)
    p0 = a.phases.prep_start
    hip = w[p0, K.R_HIP] - w[p0, K.L_HIP]
    yaw = np.arctan2(hip[2], hip[0])
    c, s = np.cos(-yaw), np.sin(-yaw)
    rot = np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]])
    xyz = w @ rot.T
    if a.handedness == "left":
        xyz[:, :, 0] *= -1
    return np.round(xyz[:, :, :2], 4).tolist()


def _track(a) -> dict[str, Any]:
    p = a.phases
    t = a.times
    return {
        "times": np.round(t, 4).tolist(),
        "landmarks": np.round(a.image, 4).tolist(),
        "overlay": _overlay_track(a),
        "handedness": a.handedness,
        "phase_times": {"prep_start": float(t[p.prep_start]), "backswing_end": float(t[p.backswing_end]),
                        "contact": float(t[p.contact]), "follow_end": float(t[p.follow_end])},
    }


def _pro_summary(p) -> dict[str, Any]:
    m = p.meta
    return {"id": p.id, "player": p.player, "stroke_type": p.stroke_type, "context": p.context,
            "handedness": p.analysis.handedness, "synthetic": bool(m.get("synthetic")),
            "video_id": m.get("video_id"), "clip_start": m.get("clip_start"),
            "clip_end": m.get("clip_end"), "time_offset": m.get("time_offset", 0.0)}


# ------------------------------------------------------------------ routes
@router.get("/api/pros")
def list_pros():
    return [_pro_summary(p) for p in library().strokes]


class ProCreate(BaseModel):
    video_id: str
    stroke_key: str
    player: str
    stroke_type: str
    context: str = "any"


@router.post("/api/pros")
def create_pro(body: ProCreate):
    from ttvision.matching.pro_matcher import ProLibrary
    from ttvision.types import StrokeType

    try:
        StrokeType(body.stroke_type)
    except ValueError:
        raise HTTPException(400, "unknown stroke type") from None
    a, seq = _user_stroke(body.video_id, body.stroke_key)
    pro_id = storage.new_id()
    ProLibrary.save(_pros_dir() / f"{pro_id}.json", seq, id=pro_id, player=body.player.strip() or "Unnamed",
                    stroke_type=body.stroke_type, context=body.context, handedness=a.handedness,
                    contact_time=a.contact_time,
                    extra={"video_id": body.video_id, "clip_start": float(seq.times[0]),
                           "clip_end": float(seq.times[-1]), "source_stroke": body.stroke_key})
    return {"id": pro_id}


@router.delete("/api/pros/{pro_id}")
def delete_pro(pro_id: str):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", pro_id):
        raise HTTPException(400, "invalid id")
    path = _pros_dir() / f"{pro_id}.json"
    if not path.exists():
        raise HTTPException(404, "not found")
    path.unlink()
    return {"ok": True}


@router.get("/api/compare/suggest")
def suggest(video_id: str, stroke_key: str, stroke_type: str | None = None):
    from ttvision.matching.pro_matcher import ProMatcher

    user, _ = _user_stroke(video_id, stroke_key)
    results = ProMatcher(library()).match(user, stroke_type=stroke_type, top_k=10)
    return [{**_pro_summary(r.pro), "similarity": round(r.similarity, 4)} for r in results]


class CompareRequest(BaseModel):
    video_id: str
    stroke_key: str
    pro_id: str


@router.post("/api/compare")
def compare(body: CompareRequest):
    from ttvision.matching.pro_matcher import ProMatcher

    user, _ = _user_stroke(body.video_id, body.stroke_key)
    lib = library()
    pro = next((p for p in lib.strokes if p.id == body.pro_id), None)
    if pro is None:
        raise HTTPException(404, "reference not found")
    result = ProMatcher(lib).compare(user, pro).to_dict()
    result.pop("path", None)
    return {"match": result, "user": _track(user),
            "pro": {**_pro_summary(pro), **_track(pro.analysis)}}
