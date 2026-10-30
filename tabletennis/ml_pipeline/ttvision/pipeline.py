"""End-to-end match analysis: rallies -> strokes -> labels -> JSON."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Callable

from .config import PipelineConfig
from .pose.analyzer import PoseAnalyzer, StrokeAnalysis
from .rally.detector import RallyDetector
from .strokes.classifier import StrokeClassifier, StrokeContext
from .types import Rally, StrokeEvent

log = logging.getLogger(__name__)
ProgressFn = Callable[[str, float], None]


def stroke_context(a: StrokeAnalysis, rally: Rally, first_user_stroke: bool) -> StrokeContext:
    is_serve = abs(a.contact_time - rally.serve_contact_time) <= 0.15
    early = sum(1 for t in rally.hit_times if t <= a.contact_time + 0.12) <= 4
    return StrokeContext(is_serve=is_serve, is_receive=first_user_stroke and not is_serve and early)


def clip_timecodes(rallies: list[Rally]) -> list[dict[str, float]]:
    """Input for the FFmpeg cutting worker."""
    return [{"index": r.index, "start": round(r.start, 3), "end": round(r.end, 3)} for r in rallies]


def analyze_match(video_path: str | Path, config: PipelineConfig | None = None,
                  progress: ProgressFn | None = None, with_pose: bool = True,
                  classifier: StrokeClassifier | None = None) -> dict[str, Any]:
    config = config or PipelineConfig()
    rallies = RallyDetector(config).detect(video_path, progress)
    log.info("found %d rallies", len(rallies))

    skeletons: dict[str, Any] = {}
    if with_pose and rallies:
        classifier = classifier or StrokeClassifier()
        with PoseAnalyzer(config.pose) as analyzer:
            _analyze_rallies(video_path, rallies, analyzer, classifier, skeletons, progress)
        if progress:
            progress("pose", 1.0)

    strokes = [s.to_dict() for r in rallies for s in r.strokes]
    return {
        "video": str(video_path),
        "rallies": [r.to_dict() for r in rallies],
        "strokes": strokes,
        "clips": clip_timecodes(rallies),
        "skeletons": skeletons,
        "summary": {
            "rally_count": len(rallies),
            "rally_time": round(sum(r.duration for r in rallies), 2),
            "stroke_counts": _count(strokes),
        },
    }


def _analyze_rallies(video_path, rallies, analyzer, classifier, skeletons, progress) -> None:
    for n, rally in enumerate(rallies):
        if progress:
            progress("pose", n / len(rallies))
        analyses = analyzer.analyze_video(video_path, [(rally.start, rally.end)], rally.hit_times)
        for k, a in enumerate(sorted(analyses, key=lambda x: x.contact_time)):
            label, conf = classifier.classify(a, stroke_context(a, rally, k == 0))
            event: StrokeEvent = a.to_event(label, conf)
            event.rally_index = rally.index
            rally.strokes.append(event)
            skeletons[f"{rally.index}:{k}"] = a.skeleton_track()


def _count(strokes: list[dict[str, Any]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for s in strokes:
        out[s["stroke_type"]] = out.get(s["stroke_type"], 0) + 1
    return out
