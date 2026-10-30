"""Analysis jobs: rally detection + pose + stroke tagging, then FFmpeg cutting.

`run_analysis` is the job itself. `submit` either runs it on a local
background thread (default, no Redis needed) or hands it to Celery.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from app import storage
from app.core.config import get_settings
from app.workers.ffmpeg import cut_rallies

log = logging.getLogger(__name__)

# overall progress share of each stage
_STAGES = {"probe": (0.0, 0.02), "audio": (0.02, 0.08), "vision": (0.08, 0.55),
           "rallies": (0.55, 0.56), "pose": (0.56, 0.85), "cutting": (0.85, 1.0)}
_LABELS = {"probe": "Reading video", "audio": "Listening for ball contacts",
           "vision": "Tracking table, ball and players", "rallies": "Finding rallies",
           "pose": "Analysing strokes", "cutting": "Cutting rally clips"}

_executor: ThreadPoolExecutor | None = None


def _progress_writer(video_id: str):
    last = [0.0]

    def report(stage: str, frac: float) -> None:
        lo, hi = _STAGES.get(stage, (0.0, 1.0))
        now = time.monotonic()
        if frac < 1.0 and now - last[0] < 0.4:      # throttle disk writes
            return
        last[0] = now
        storage.update_job(video_id, status="running", stage=stage, message=_LABELS.get(stage, stage),
                           progress=round(lo + (hi - lo) * min(max(frac, 0.0), 1.0), 4))
    return report


def run_analysis(video_id: str) -> None:
    from ttvision.config import PipelineConfig
    from ttvision.media.ffmpeg import probe
    from ttvision.pipeline import analyze_match

    settings = get_settings()
    vdir = storage.video_dir(video_id)
    src = storage.source_path(video_id)
    report = _progress_writer(video_id)
    try:
        if src is None:
            raise FileNotFoundError("source video missing")
        report("probe", 0.0)
        info = probe(src)
        meta = storage.read_json(vdir / "meta.json", {})
        meta.update(duration=info.duration, fps=info.fps, width=info.width, height=info.height,
                    has_audio=info.has_audio)
        storage.write_json(vdir / "meta.json", meta)

        cfg = PipelineConfig.load(settings.pipeline_config)
        pose_store: dict = {}
        result = analyze_match(src, cfg, progress=report, with_pose=True, pose_store=pose_store)

        skeletons = result.pop("skeletons", {})
        storage.write_json(vdir / "skeletons.json", skeletons)
        if pose_store:
            arrays = {}
            for key, p in pose_store.items():
                k = key.replace(":", "_")
                arrays[f"{k}__times"] = np.asarray(p["times"], np.float32)
                arrays[f"{k}__world"] = np.asarray(p["world"], np.float32)
                arrays[f"{k}__image"] = np.asarray(p["image"], np.float32)
                arrays[f"{k}__info"] = np.array([p["contact_time"], 1.0 if p["handedness"] == "right" else 0.0])
            np.savez_compressed(vdir / "pose.npz", **arrays)
        result["video"] = video_id
        storage.write_json(vdir / "analysis.json", result)

        report("cutting", 0.0)
        cut_rallies(src, result["clips"], vdir, settings.cut_mode, settings.cut_crf,
                    progress=lambda f: report("cutting", f))

        storage.update_job(video_id, status="done", stage="done", progress=1.0,
                           message=f"{len(result['rallies'])} rallies, {len(result['strokes'])} strokes",
                           warnings=result.get("warnings", []))
    except Exception as exc:
        log.exception("analysis failed for %s", video_id)
        storage.update_job(video_id, status="failed", message="Processing failed", error=str(exc))


def submit(video_id: str) -> None:
    global _executor
    storage.update_job(video_id, status="queued", stage="queued", progress=0.0,
                       message="Waiting to start", error=None, warnings=[])
    if get_settings().queue == "celery":
        from app.workers.tasks import analyze_video_task

        analyze_video_task.delay(video_id)
        return
    if _executor is None:
        _executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="analysis")
    _executor.submit(run_analysis, video_id)


def recover_interrupted() -> None:
    """Jobs left 'running' by a crash/restart would never finish: mark them."""
    if get_settings().queue == "celery":
        return
    for v in storage.list_videos():
        if v.get("job", {}).get("status") in ("queued", "running"):
            storage.update_job(v["id"], status="failed", message="Interrupted",
                               error="The server restarted while this video was processing. Click Reprocess.")
