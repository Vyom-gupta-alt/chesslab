"""Plain data types shared across the pipeline.

Everything here is JSON-serialisable through `to_dict()` so the backend can
store results and stream them to the frontend without extra mapping code.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any

import numpy as np


class StrokeType(str, Enum):
    # Serves
    SERVE_PENDULUM = "serve_pendulum"
    SERVE_REVERSE_PENDULUM = "serve_reverse_pendulum"
    SERVE_TOMAHAWK = "serve_tomahawk"
    SERVE_BACKHAND = "serve_backhand"
    # Receives
    RECEIVE_SHORT_FLICK = "receive_short_flick"
    RECEIVE_LONG_FLICK = "receive_long_flick"
    RECEIVE_PUSH = "receive_push"
    # Rally strokes
    FOREHAND_TOPSPIN = "forehand_topspin"
    BACKHAND_TOPSPIN = "backhand_topspin"
    FOREHAND_PUSH = "forehand_push"
    BACKHAND_PUSH = "backhand_push"
    BLOCK = "block"
    COUNTER_DRIVE = "counter_drive"
    CHOP = "chop"
    LOB = "lob"
    SMASH = "smash"
    UNKNOWN = "unknown"

    @property
    def category(self) -> str:
        if self.value.startswith("serve_"):
            return "serve"
        if self.value.startswith("receive_"):
            return "receive"
        if self is StrokeType.UNKNOWN:
            return "unknown"
        return "stroke"


# Filter tabs used by the dashboard map onto groups of stroke types.
SKILL_GROUPS: dict[str, list[StrokeType]] = {
    "serve": [t for t in StrokeType if t.category == "serve"],
    "receive": [t for t in StrokeType if t.category == "receive"],
    "push": [StrokeType.FOREHAND_PUSH, StrokeType.BACKHAND_PUSH, StrokeType.RECEIVE_PUSH],
    "forehand_loop": [StrokeType.FOREHAND_TOPSPIN],
    "backhand_loop": [StrokeType.BACKHAND_TOPSPIN],
    "defence": [StrokeType.BLOCK, StrokeType.CHOP, StrokeType.LOB],
    "attack": [StrokeType.SMASH, StrokeType.COUNTER_DRIVE, StrokeType.FOREHAND_TOPSPIN,
               StrokeType.BACKHAND_TOPSPIN],
}


class StrokePhase(str, Enum):
    PREPARATION = "preparation"      # ready position -> end of backswing
    CONTACT = "contact"
    FOLLOW_THROUGH = "follow_through"


@dataclass
class AudioHit:
    """A short transient in the 2.5-4 kHz band (ball on bat, table or net)."""

    time: float
    strength: float      # onset strength above the adaptive threshold
    band_ratio: float    # share of frame energy inside the ball band

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class BallObservation:
    time: float
    x: float             # image pixels (in the analysis resolution)
    y: float
    radius: float
    score: float
    table_xy: tuple[float, float] | None = None   # cm in table coordinates, if known

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class TableGeometry:
    """Four table corners in image pixels, ordered TL, TR, BR, BL."""

    corners: np.ndarray            # (4, 2) float32
    homography: np.ndarray         # image -> table cm (3x3)
    frame_size: tuple[int, int]    # (width, height) of the frame the corners refer to

    def to_dict(self) -> dict[str, Any]:
        return {
            "corners": self.corners.tolist(),
            "homography": self.homography.tolist(),
            "frame_size": list(self.frame_size),
        }


@dataclass
class Rally:
    index: int
    start: float          # clip start: serve toss minus pre-roll
    end: float            # clip end: point over (+ small tail)
    serve_toss_time: float
    serve_contact_time: float
    last_hit_time: float
    end_reason: str       # "ball_out", "ball_dead", "dribble", "timeout", "audio_gap"
    confidence: float
    hit_times: list[float] = field(default_factory=list)
    strokes: list["StrokeEvent"] = field(default_factory=list)

    @property
    def duration(self) -> float:
        return self.end - self.start

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["duration"] = self.duration
        d["strokes"] = [s.to_dict() for s in self.strokes]
        return d


@dataclass
class PhaseKeyframe:
    phase: StrokePhase
    time: float
    frame_index: int
    angles: dict[str, float]

    def to_dict(self) -> dict[str, Any]:
        return {"phase": self.phase.value, "time": self.time,
                "frame_index": self.frame_index, "angles": self.angles}


@dataclass
class StrokeEvent:
    time: float                       # contact time
    stroke_type: StrokeType
    confidence: float
    handedness: str                   # "right" | "left"
    start: float                      # start of preparation phase
    end: float                        # end of follow-through
    keyframes: list[PhaseKeyframe] = field(default_factory=list)
    metrics: dict[str, float] = field(default_factory=dict)
    rally_index: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "time": self.time,
            "stroke_type": self.stroke_type.value,
            "category": self.stroke_type.category,
            "confidence": self.confidence,
            "handedness": self.handedness,
            "start": self.start,
            "end": self.end,
            "keyframes": [k.to_dict() for k in self.keyframes],
            "metrics": self.metrics,
            "rally_index": self.rally_index,
        }
