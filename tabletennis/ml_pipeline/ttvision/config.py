"""Pipeline configuration.

Defaults live in the dataclasses; `configs/default.yaml` mirrors them so they
can be tuned per camera setup without code changes.
"""

from __future__ import annotations

from dataclasses import dataclass, field, fields, is_dataclass
from pathlib import Path
from typing import Any


@dataclass
class AudioConfig:
    sample_rate: int = 22050
    n_fft: int = 512
    hop_length: int = 128                 # ~5.8 ms at 22.05 kHz
    band_low_hz: float = 2500.0           # ball-on-bat / ball-on-table band
    band_high_hz: float = 4000.0
    min_band_ratio: float = 0.18          # reject voices, footsteps, shoe squeaks
    threshold_window_s: float = 0.6       # adaptive threshold window
    threshold_k: float = 4.0              # median + k * MAD
    min_hit_interval_s: float = 0.08      # two hits can't be closer than this
    min_onset_rise: float = 1.0           # natural-log energy jump (~4.3 dB)
    min_level_above_background_db: float = 9.0
    background_window_s: float = 1.5


@dataclass
class VisionConfig:
    analysis_width: int = 640             # frames are resized to this width
    analysis_fps: float = 30.0            # max frames per second we look at
    table_sample_count: int = 15          # frames used to vote table corners
    table_corners: list[list[float]] | None = None   # manual override (analysis px)
    camera_view: str = "auto"             # "auto" | "end" (behind a player) | "side"
    ball_min_radius_px: float = 2.0
    ball_max_radius_px: float = 12.0
    ball_min_circularity: float = 0.55
    ball_backend: str = "motion"          # "motion" | "yolo"
    yolo_weights: str | None = None       # e.g. a YOLOv11 model fine-tuned on TT balls
    yolo_conf: float = 0.25


@dataclass
class RallyConfig:
    pre_roll_s: float = 1.0               # clip starts this long before the serve toss
    post_roll_s: float = 0.6              # tail kept after the point ends
    min_hits: int = 3                     # serve = bat + own side + far side bounce
    max_hit_gap_s: float = 1.6            # bigger gap => rally is over
    max_rally_s: float = 60.0
    default_toss_duration_s: float = 0.7  # used when the toss can't be seen
    toss_search_window_s: float = 2.0
    dribble_max_interval_s: float = 0.35  # decaying bounce trains => ball dying
    dribble_decay_ratio: float = 0.92
    min_confidence: float = 0.35
    merge_gap_s: float = 0.3


@dataclass
class PoseConfig:
    model_path: str | None = None         # MediaPipe .task file; None = auto-download
    model_complexity: int = 2             # 0 lite, 1 full, 2 heavy (auto-download variant)
    num_poses: int = 2
    target_player: str = "near"           # "near" | "far" | "left" | "right"
    handedness: str = "auto"              # "right" | "left" | "auto"
    min_visibility: float = 0.5
    smoothing_window: int = 5             # Savitzky-Golay-ish moving window (frames)
    stroke_window_pre_s: float = 0.7
    stroke_window_post_s: float = 0.5
    min_racket_speed: float = 1.5         # m/s, peak needed to count as a stroke
    forearm_extension: float = 0.18       # m, wrist -> racket centre estimate


@dataclass
class MatcherConfig:
    library_dir: str = "data/pro_library"
    dtw_band_ratio: float = 0.2           # Sakoe-Chiba band as fraction of length
    resample_length: int = 60
    top_k: int = 3


@dataclass
class PipelineConfig:
    audio: AudioConfig = field(default_factory=AudioConfig)
    vision: VisionConfig = field(default_factory=VisionConfig)
    rally: RallyConfig = field(default_factory=RallyConfig)
    pose: PoseConfig = field(default_factory=PoseConfig)
    matcher: MatcherConfig = field(default_factory=MatcherConfig)

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> "PipelineConfig":
        return _build(cls, data or {})

    @classmethod
    def load(cls, path: str | Path | None) -> "PipelineConfig":
        if path is None:
            return cls()
        import yaml  # optional dependency, only needed for file configs

        with open(path, "r", encoding="utf-8") as fh:
            return cls.from_dict(yaml.safe_load(fh) or {})


def _build(cls, data: dict[str, Any]):
    kwargs = {}
    for f in fields(cls):
        if f.name not in data:
            continue
        value = data[f.name]
        default = f.default_factory() if callable(f.default_factory) else None  # type: ignore[misc]
        if is_dataclass(default) and isinstance(value, dict):
            value = _build(type(default), value)
        kwargs[f.name] = value
    unknown = set(data) - {f.name for f in fields(cls)}
    if unknown:
        raise ValueError(f"Unknown config keys for {cls.__name__}: {sorted(unknown)}")
    return cls(**kwargs)
