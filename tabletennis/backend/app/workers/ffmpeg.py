"""FFmpeg cutting worker: timecodes [{start, end}] -> rally clips + one rally-only video."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Callable, Sequence


def _ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    if path is None:
        raise RuntimeError("ffmpeg not found on PATH")
    return path


def cut_clip(source: Path, start: float, end: float, out: Path, mode: str = "accurate",
             crf: int = 18) -> None:
    duration = max(end - start, 0.05)
    if mode == "copy":
        # no re-encode: lossless and fast, but the cut snaps to the previous keyframe
        args = ["-ss", f"{start:.3f}", "-i", str(source), "-t", f"{duration:.3f}",
                "-c", "copy", "-avoid_negative_ts", "make_zero"]
    else:
        # frame-accurate: seek fast to just before, then decode precisely
        args = ["-ss", f"{start:.3f}", "-i", str(source), "-t", f"{duration:.3f}",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", str(crf), "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
                "-video_track_timescale", "90000"]
    subprocess.run([_ffmpeg(), "-v", "error", "-y", *args, "-movflags", "+faststart", str(out)],
                   check=True, capture_output=True)


def concat(clips: Sequence[Path], out: Path) -> None:
    """Join clips with the concat demuxer (stream copy; clips share encoding settings)."""
    if not clips:
        return
    listing = out.with_suffix(".txt")
    listing.write_text("".join(f"file '{c.resolve().as_posix()}'\n" for c in clips))
    try:
        subprocess.run([_ffmpeg(), "-v", "error", "-y", "-f", "concat", "-safe", "0",
                        "-i", str(listing), "-c", "copy", "-movflags", "+faststart", str(out)],
                       check=True, capture_output=True)
    finally:
        listing.unlink(missing_ok=True)


def cut_rallies(source: Path, timecodes: Sequence[dict], out_dir: Path, mode: str = "accurate",
                crf: int = 18, progress: Callable[[float], None] | None = None) -> list[Path]:
    """Cut every rally clip and build highlights.mp4 next to the clips folder."""
    clip_dir = out_dir / "clips"
    clip_dir.mkdir(parents=True, exist_ok=True)
    clips = []
    for n, tc in enumerate(timecodes):
        path = clip_dir / f"rally_{int(tc['index']):03d}.mp4"
        cut_clip(source, float(tc["start"]), float(tc["end"]), path, mode, crf)
        clips.append(path)
        if progress:
            progress((n + 1) / max(len(timecodes), 1))
    concat(clips, out_dir / "highlights.mp4")
    return clips
