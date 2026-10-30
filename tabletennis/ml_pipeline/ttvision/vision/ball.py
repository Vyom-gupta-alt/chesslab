"""Ball detection and tracking.

Two backends share one interface (`detect(frames) -> candidates`):

* `MotionBallDetector` needs no weights. It differences three consecutive
  frames (the ball is the small, fast, bright, round thing that moved) and
  scores blobs by size, roundness and brightness.
* `YoloBallDetector` runs an Ultralytics model (e.g. YOLOv11 fine-tuned on
  table tennis balls, or COCO "sports ball" as a weak fallback). A TrackNet
  heatmap model can be plugged in the same way by implementing `detect`.

`BallTracker` links per-frame candidates into one trajectory with a
constant-velocity predictor and gating, which removes most false positives
(heads, hands, shiny shoes).
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Protocol

import numpy as np

from ..config import VisionConfig
from ..types import BallObservation, TableGeometry
from .table import to_table_coords


@dataclass
class BallCandidate:
    x: float
    y: float
    radius: float
    score: float


class BallDetectorBackend(Protocol):
    def detect(self, image: np.ndarray) -> list[BallCandidate]: ...


class MotionBallDetector:
    def __init__(self, cfg: VisionConfig):
        self.cfg = cfg
        self._history: deque[np.ndarray] = deque(maxlen=3)

    def reset(self) -> None:
        self._history.clear()

    def detect(self, image: np.ndarray) -> list[BallCandidate]:
        import cv2

        gray = cv2.GaussianBlur(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), (3, 3), 0)
        self._history.append(gray)
        if len(self._history) < 3:
            return []
        a, b, c = self._history
        # pixels that differ from both neighbours: the object in the middle frame
        d1 = cv2.absdiff(b, a)
        d2 = cv2.absdiff(b, c)
        motion = cv2.bitwise_and(d1, d2)
        _, mask = cv2.threshold(motion, 18, 255, cv2.THRESH_BINARY)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        mask = cv2.dilate(mask, np.ones((3, 3), np.uint8))

        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        rmin, rmax = self.cfg.ball_min_radius_px, self.cfg.ball_max_radius_px
        out: list[BallCandidate] = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            (x, y), r = cv2.minEnclosingCircle(cnt)
            if not (rmin <= r <= rmax) or area < 3:
                continue
            perim = cv2.arcLength(cnt, True) or 1.0
            circularity = 4 * np.pi * area / (perim * perim)
            # motion blur stretches a fast ball, so also accept elongated blobs
            if circularity < self.cfg.ball_min_circularity * 0.6:
                continue
            xi, yi = int(np.clip(x, 0, image.shape[1] - 1)), int(np.clip(y, 0, image.shape[0] - 1))
            hh, ss, vv = (int(v) for v in hsv[yi, xi])
            white = vv > 150 and ss < 70
            orange = 5 <= hh <= 25 and ss > 120 and vv > 120
            colour = 1.0 if (white or orange) else 0.35
            score = colour * min(1.0, circularity / max(self.cfg.ball_min_circularity, 1e-3))
            out.append(BallCandidate(float(x), float(y), float(r), float(score)))
        out.sort(key=lambda c: c.score, reverse=True)
        return out[:8]


class YoloBallDetector:
    COCO_SPORTS_BALL = 32

    def __init__(self, cfg: VisionConfig):
        from ultralytics import YOLO  # optional dependency

        self.cfg = cfg
        self.model = YOLO(cfg.yolo_weights or "yolo11n.pt")
        names = getattr(self.model, "names", {}) or {}
        ball_ids = [i for i, n in names.items() if "ball" in str(n).lower()]
        self.class_ids = ball_ids or [self.COCO_SPORTS_BALL]

    def reset(self) -> None:
        pass

    def detect(self, image: np.ndarray) -> list[BallCandidate]:
        res = self.model.predict(image, conf=self.cfg.yolo_conf, classes=self.class_ids,
                                 verbose=False)[0]
        out = []
        for (x1, y1, x2, y2), conf in zip(res.boxes.xyxy.cpu().numpy(), res.boxes.conf.cpu().numpy()):
            out.append(BallCandidate((x1 + x2) / 2, (y1 + y2) / 2,
                                     max(x2 - x1, y2 - y1) / 2, float(conf)))
        return out


def make_ball_detector(cfg: VisionConfig) -> BallDetectorBackend:
    if cfg.ball_backend == "yolo":
        return YoloBallDetector(cfg)
    return MotionBallDetector(cfg)


class BallTracker:
    """Greedy single-target tracker with a constant-velocity prediction gate."""

    def __init__(self, gate_px: float = 60.0, max_missing: int = 6):
        self.gate_px = gate_px
        self.max_missing = max_missing
        self._pos: np.ndarray | None = None
        self._vel = np.zeros(2)
        self._t: float | None = None
        self._missing = 0

    def update(self, t: float, candidates: list[BallCandidate]) -> BallCandidate | None:
        if not candidates:
            self._miss()
            return None
        if self._pos is None or self._t is None:
            best = max(candidates, key=lambda c: c.score)
            if best.score < 0.5:
                return None
            self._accept(t, best)
            return best

        dt = max(t - self._t, 1e-3)
        pred = self._pos + self._vel * dt
        gate = self.gate_px * (1 + self._missing)
        scored = []
        for c in candidates:
            dist = float(np.hypot(c.x - pred[0], c.y - pred[1]))
            if dist <= gate:
                scored.append((c.score - 0.5 * dist / gate, c))
        if not scored:
            self._miss()
            return None
        best = max(scored, key=lambda s: s[0])[1]
        self._accept(t, best)
        return best

    def _accept(self, t: float, c: BallCandidate) -> None:
        pos = np.array([c.x, c.y])
        if self._pos is not None and self._t is not None:
            new_vel = (pos - self._pos) / max(t - self._t, 1e-3)
            self._vel = 0.6 * new_vel + 0.4 * self._vel
        self._pos, self._t, self._missing = pos, t, 0

    def _miss(self) -> None:
        self._missing += 1
        if self._missing > self.max_missing:
            self._pos, self._t, self._vel = None, None, np.zeros(2)


def to_observation(t: float, c: BallCandidate, table: TableGeometry | None) -> BallObservation:
    table_xy = to_table_coords(table.homography, (c.x, c.y)) if table is not None else None
    return BallObservation(time=t, x=c.x, y=c.y, radius=c.radius, score=c.score, table_xy=table_xy)
