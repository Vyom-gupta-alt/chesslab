"""Frame reader that downsamples in time and space for analysis."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

import numpy as np


@dataclass
class Frame:
    index: int          # index in the source video
    time: float         # seconds
    image: np.ndarray   # BGR, resized to analysis width


class VideoReader:
    def __init__(self, path: str | Path, analysis_width: int = 640, max_fps: float = 30.0):
        import cv2

        self._cv2 = cv2
        self.path = str(path)
        self.cap = cv2.VideoCapture(self.path)
        if not self.cap.isOpened():
            raise IOError(f"Cannot open video: {path}")
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 30.0
        self.frame_count = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.duration = self.frame_count / self.fps if self.fps else 0.0
        self.scale = min(1.0, analysis_width / max(self.width, 1))
        self.step = max(1, round(self.fps / max_fps))

    @property
    def analysis_fps(self) -> float:
        return self.fps / self.step

    @property
    def analysis_size(self) -> tuple[int, int]:
        return int(round(self.width * self.scale)), int(round(self.height * self.scale))

    def _resize(self, img: np.ndarray) -> np.ndarray:
        if self.scale >= 1.0:
            return img
        return self._cv2.resize(img, self.analysis_size, interpolation=self._cv2.INTER_AREA)

    def frames(self, start: float = 0.0, end: float | None = None,
               step: int | None = None) -> Iterator[Frame]:
        """Yield every `step`-th frame between start and end (seconds).

        Uses grab() for skipped frames, which avoids decoding to BGR.
        """
        cv2 = self._cv2
        step = step or self.step
        first = max(0, int(start * self.fps))
        last = self.frame_count if end is None else min(self.frame_count, int(end * self.fps) + 1)
        self.cap.set(cv2.CAP_PROP_POS_FRAMES, first)
        idx = first
        while idx < last:
            if (idx - first) % step == 0:
                ok, img = self.cap.read()
                if not ok:
                    break
                yield Frame(idx, idx / self.fps, self._resize(img))
            elif not self.cap.grab():
                break
            idx += 1

    def sample(self, n: int) -> list[Frame]:
        """n frames spread evenly over the video (for table voting)."""
        cv2 = self._cv2
        out = []
        for idx in np.linspace(0, max(self.frame_count - 1, 0), n).astype(int):
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
            ok, img = self.cap.read()
            if ok:
                out.append(Frame(int(idx), idx / self.fps, self._resize(img)))
        return out

    def close(self) -> None:
        self.cap.release()

    def __enter__(self) -> "VideoReader":
        return self

    def __exit__(self, *exc) -> None:
        self.close()
