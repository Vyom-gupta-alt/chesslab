"""MediaPipe pose estimation wrapper (33 BlazePose joints, 2D + 3D).

Uses the MediaPipe Tasks `PoseLandmarker` (multi-person, 2D + metric 3D world
landmarks). The legacy `mp.solutions` API is gone from current MediaPipe
releases. If no model file is configured, the official lite/full/heavy model
(per `model_complexity`) is downloaded once to ~/.cache/ttvision. Any other
estimator (AlphaPose, RTMPose lifted to 3D, ...) can be used by implementing
`PoseEstimator.estimate`.
"""

from __future__ import annotations

import os
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np

from ..config import PoseConfig


@dataclass
class PersonPose:
    image: np.ndarray       # (33, 3): x, y normalised to [0, 1], visibility
    world: np.ndarray       # (33, 3): metres, hip-centred, y down

    @property
    def bbox_area(self) -> float:
        vis = self.image[:, 2] > 0.3
        if vis.sum() < 4:
            return 0.0
        xy = self.image[vis, :2]
        span = xy.max(axis=0) - xy.min(axis=0)
        return float(span[0] * span[1])

    @property
    def centre(self) -> np.ndarray:
        return self.image[[23, 24], :2].mean(axis=0)


class PoseEstimator(Protocol):
    def estimate(self, image_bgr: np.ndarray, timestamp_ms: int) -> list[PersonPose]: ...


_MODEL_VARIANTS = {0: "lite", 1: "full", 2: "heavy"}
_MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
              "pose_landmarker_{v}/float16/latest/pose_landmarker_{v}.task")


def ensure_pose_model(cfg: PoseConfig) -> str:
    """Return a local .task model path, downloading the official one if needed."""
    if cfg.model_path:
        return cfg.model_path
    variant = _MODEL_VARIANTS.get(cfg.model_complexity, "heavy")
    cache = Path(os.environ.get("TTVISION_CACHE", Path.home() / ".cache" / "ttvision"))
    path = cache / f"pose_landmarker_{variant}.task"
    if not path.exists():
        cache.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        urllib.request.urlretrieve(_MODEL_URL.format(v=variant), tmp)
        tmp.replace(path)
    return str(path)


class MediaPipePoseEstimator:
    """MediaPipe Tasks PoseLandmarker in VIDEO mode (uses temporal tracking)."""

    def __init__(self, cfg: PoseConfig | None = None):
        import mediapipe as mp  # optional heavy dependency
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision

        self.cfg = cfg or PoseConfig()
        self._mp = mp
        self._last_ts = -1
        options = vision.PoseLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=ensure_pose_model(self.cfg)),
            running_mode=vision.RunningMode.VIDEO,
            num_poses=self.cfg.num_poses,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._landmarker = vision.PoseLandmarker.create_from_options(options)

    def estimate(self, image_bgr: np.ndarray, timestamp_ms: int) -> list[PersonPose]:
        rgb = np.ascontiguousarray(image_bgr[:, :, ::-1])
        # VIDEO mode requires strictly increasing timestamps, even across clips
        ts = max(int(timestamp_ms), self._last_ts + 1)
        self._last_ts = ts
        img = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb)
        res = self._landmarker.detect_for_video(img, ts)
        people = []
        for lm2d, lm3d in zip(res.pose_landmarks, res.pose_world_landmarks):
            people.append(PersonPose(
                image=np.array([[p.x, p.y, p.visibility or 0.0] for p in lm2d], np.float32),
                world=np.array([[p.x, p.y, p.z] for p in lm3d], np.float32),
            ))
        return people

    def close(self) -> None:
        self._landmarker.close()


def select_player(people: list[PersonPose], target: str,
                  previous: PersonPose | None = None) -> PersonPose | None:
    """Pick the user's pose from everyone detected in a frame.

    Continuity wins first (stay with the person closest to last frame), then the
    configured rule: near = biggest on screen, far = smallest, left/right by x.
    """
    if not people:
        return None
    if previous is not None:
        dists = [float(np.linalg.norm(p.centre - previous.centre)) for p in people]
        best = int(np.argmin(dists))
        if dists[best] < 0.12:
            return people[best]
    if target == "far":
        return min(people, key=lambda p: p.bbox_area)
    if target == "left":
        return min(people, key=lambda p: p.centre[0])
    if target == "right":
        return max(people, key=lambda p: p.centre[0])
    return max(people, key=lambda p: p.bbox_area)
