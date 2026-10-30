"""ttvision: table tennis video analysis (rally clipping, pose, stroke analysis)."""

from .config import PipelineConfig
from .types import Rally, StrokeEvent, StrokePhase, StrokeType

__all__ = ["PipelineConfig", "Rally", "StrokeEvent", "StrokePhase", "StrokeType"]
__version__ = "0.1.0"
