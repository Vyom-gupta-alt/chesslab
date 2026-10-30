"""Audio-visual rally detection (dead-time removal).

Pipeline
--------
1. **Collect signals** from the video (`collect_signals`):
   audio ball-contact clicks, the ball trajectory (image + table coords),
   and player motion on each side of the net.
2. **Segment** (`segment`, pure function of the signals):
   a. group hits into candidate rallies wherever the gap between hits is
      short enough for the ball to still be in play;
   b. drop the server's pre-serve bounces (ball never crosses the net);
   c. drop the decaying "dribble" of the dead ball at the end;
   d. find the serve toss on the ball track just before serve contact;
   e. find where the point ends (ball leaves the table area, or the audio stops);
   f. score each candidate and keep the confident ones.
3. Each clip starts `pre_roll_s` (1.0 s) before the toss and ends
   `post_roll_s` after the point ends.

Without audio (muted phone footage) the hits come from sharp direction
changes on the ball track instead.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import numpy as np

from ..audio.hits import AudioHitDetector
from ..config import PipelineConfig, RallyConfig
from ..types import AudioHit, BallObservation, Rally, TableGeometry

log = logging.getLogger(__name__)

ProgressFn = Callable[[str, float], None]

# table area (cm) with a margin, used to decide whether the ball is still "in play"
_IN_PLAY_MARGIN_CM = 40.0


@dataclass
class RallySignals:
    duration: float
    hits: list[AudioHit] = field(default_factory=list)
    ball: list[BallObservation] = field(default_factory=list)
    frame_times: np.ndarray = field(default_factory=lambda: np.zeros(0))
    motion: np.ndarray = field(default_factory=lambda: np.zeros((0, 2)))   # per frame_times
    table: TableGeometry | None = None
    hits_from_audio: bool = True


class RallyDetector:
    def __init__(self, config: PipelineConfig | None = None):
        self.config = config or PipelineConfig()
        self.cfg: RallyConfig = self.config.rally

    # ------------------------------------------------------------------ public
    def detect(self, video_path: str | Path, progress: ProgressFn | None = None) -> list[Rally]:
        signals = self.collect_signals(video_path, progress)
        rallies = self.segment(signals)
        if progress:
            progress("rallies", 1.0)
        return rallies

    def collect_signals(self, video_path: str | Path,
                        progress: ProgressFn | None = None) -> RallySignals:
        from ..media.ffmpeg import load_audio, probe
        from ..vision.ball import BallTracker, make_ball_detector, to_observation
        from ..vision.motion import PlayerActivity
        from ..vision.table import TableDetector
        from ..vision.video import VideoReader

        info = probe(video_path)
        vcfg, acfg = self.config.vision, self.config.audio

        hits: list[AudioHit] = []
        if info.has_audio:
            if progress:
                progress("audio", 0.0)
            samples = load_audio(video_path, acfg.sample_rate)
            hits = AudioHitDetector(acfg).detect(samples, acfg.sample_rate)
            log.info("audio: %d candidate ball contacts", len(hits))

        with VideoReader(video_path, vcfg.analysis_width, vcfg.analysis_fps) as reader:
            samples_img = [f.image for f in reader.sample(vcfg.table_sample_count)]
            table = TableDetector(view=vcfg.camera_view).detect(samples_img, vcfg.table_corners)
            if table is None:
                log.warning("table not found; court coordinates disabled")

            detector = make_ball_detector(vcfg)
            tracker = BallTracker(gate_px=vcfg.analysis_width * 0.1)
            activity = PlayerActivity(table, reader.analysis_size)
            ball: list[BallObservation] = []
            times, motion = [], []
            total = max(reader.frame_count, 1)
            for frame in reader.frames():
                cand = tracker.update(frame.time, detector.detect(frame.image))
                if cand is not None:
                    ball.append(to_observation(frame.time, cand, table))
                times.append(frame.time)
                motion.append(activity.update(frame.image))
                if progress and frame.index % 300 == 0:
                    progress("vision", frame.index / total)

        signals = RallySignals(
            duration=info.duration,
            hits=hits,
            ball=ball,
            frame_times=np.asarray(times, dtype=float),
            motion=np.asarray(motion, dtype=float).reshape(-1, 2),
            table=table,
            hits_from_audio=bool(hits),
        )
        if not hits:
            signals.hits = visual_hits(ball)
            signals.hits_from_audio = False
        return signals

    # -------------------------------------------------------------- segmenting
    def segment(self, s: RallySignals) -> list[Rally]:
        cfg = self.cfg
        hit_times = np.array(sorted(h.time for h in s.hits), dtype=float)
        ball_t = np.array([b.time for b in s.ball], dtype=float)
        motion_ref = float(np.median(s.motion.sum(axis=1))) if len(s.motion) else 0.0

        rallies: list[Rally] = []
        for group in self._group_hits(hit_times):
            group = self._trim_pre_serve(group, s, ball_t)
            group, dribbled = self._trim_dribble(group)
            if len(group) < cfg.min_hits:
                continue
            contact, last_hit = float(group[0]), float(group[-1])

            toss = self._find_toss(contact, s, ball_t)
            end, reason = self._find_end(last_hit, s, ball_t)
            if dribbled and reason == "audio_gap":
                reason = "dribble"
            confidence = self._confidence(group, s, motion_ref)
            if confidence < cfg.min_confidence:
                log.debug("drop candidate %.2f-%.2f (conf %.2f)", contact, last_hit, confidence)
                continue

            rallies.append(Rally(
                index=0,
                start=max(0.0, toss - cfg.pre_roll_s),
                end=min(s.duration, end + cfg.post_roll_s) if s.duration else end + cfg.post_roll_s,
                serve_toss_time=toss,
                serve_contact_time=contact,
                last_hit_time=last_hit,
                end_reason=reason,
                confidence=round(confidence, 3),
                hit_times=[round(float(t), 3) for t in group],
            ))
        return self._resolve_overlaps(rallies)

    def _group_hits(self, times: np.ndarray) -> list[np.ndarray]:
        if times.size == 0:
            return []
        splits = np.flatnonzero(np.diff(times) > self.cfg.max_hit_gap_s) + 1
        groups = []
        for g in np.split(times, splits):
            # very long groups (continuous noise) get cut into max_rally_s chunks
            while g.size and g[-1] - g[0] > self.cfg.max_rally_s:
                cut = int(np.searchsorted(g, g[0] + self.cfg.max_rally_s))
                groups.append(g[:cut])
                g = g[cut:]
            if g.size:
                groups.append(g)
        return groups

    def _trim_pre_serve(self, group: np.ndarray, s: RallySignals, ball_t: np.ndarray) -> np.ndarray:
        """Remove the server bouncing the ball before serving."""
        if group.size < 2:
            return group
        # with court coordinates: the serve is the first hit after which the ball crosses the net
        if s.table is not None and ball_t.size:
            for i, t in enumerate(group[:-1]):
                if _crosses_net(s.ball, ball_t, t, min(t + 1.2, group[-1] + 0.5)):
                    return group[i:]
            # no net crossing seen (ball lost); fall through to the timing heuristic

        # timing heuristic: a run of >= 3 near-identical, slow intervals at the start
        iv = np.diff(group)
        run = 0
        while run + 1 < iv.size and iv[run] >= 0.4 and abs(iv[run + 1] - iv[run]) <= 0.12 * iv[run]:
            run += 1
        if run >= 2:
            # intervals 0..run are all regular, so hits 0..run+1 were bounces
            return group[run + 2:]
        return group

    def _trim_dribble(self, group: np.ndarray) -> tuple[np.ndarray, bool]:
        """Remove the shortening bounce train of a dead ball at the end."""
        cfg = self.cfg
        iv = np.diff(group)
        k = iv.size - 1
        n_decay = 0
        while (k >= 1 and iv[k] < cfg.dribble_max_interval_s
               and iv[k] < iv[k - 1] * cfg.dribble_decay_ratio):
            n_decay += 1
            k -= 1
        if n_decay >= 2:
            # keep the first bounce of the train: that is when the point ended
            return group[: k + 2], True
        return group, False

    def _find_toss(self, contact: float, s: RallySignals, ball_t: np.ndarray) -> float:
        cfg = self.cfg
        fallback = contact - cfg.default_toss_duration_s
        if ball_t.size == 0:
            return max(0.0, fallback)
        lo = int(np.searchsorted(ball_t, contact - cfg.toss_search_window_s))
        hi = int(np.searchsorted(ball_t, contact - 0.03))
        window = s.ball[lo:hi]
        if len(window) < 3:
            return max(0.0, fallback)

        ys = np.array([b.y for b in window])
        apex = int(np.argmin(ys))                     # image y grows downward
        rise = ys[: apex + 1].max() - ys[apex] if apex > 0 else 0.0
        if rise < 4 * max(window[apex].radius, 1.0):
            return max(0.0, fallback)

        # walk back from the apex while the ball is not higher earlier on (palm -> apex)
        i = apex
        while i > 0:
            if window[i].time - window[i - 1].time > 0.15 or window[i - 1].y < window[i].y - 1.0:
                break
            i -= 1
        # the toss starts at the first frame where the ball has clearly left the palm
        base, total_rise = window[i].y, window[i].y - window[apex].y
        k = i
        while k < apex and base - window[k + 1].y <= 0.03 * total_rise:
            k += 1
        i = k
        toss = window[i].time
        # sanity: a legal toss takes ~0.3-1.5 s from palm to contact
        if not (0.25 <= contact - toss <= 1.8):
            return max(0.0, fallback)
        return toss

    def _find_end(self, last_hit: float, s: RallySignals, ball_t: np.ndarray) -> tuple[float, str]:
        if s.table is not None and ball_t.size:
            lo = int(np.searchsorted(ball_t, last_hit))
            hi = int(np.searchsorted(ball_t, last_hit + 1.5))
            for b in s.ball[lo:hi]:
                if b.table_xy is not None and not _over_table(b.table_xy):
                    return b.time, "ball_out"
            if hi > lo:
                last_seen = s.ball[hi - 1].time
                if last_seen < last_hit + 1.4:
                    return last_seen, "ball_dead"
        return last_hit + 0.3, "audio_gap"

    def _confidence(self, group: np.ndarray, s: RallySignals, motion_ref: float) -> float:
        iv = np.diff(group)
        parts: list[tuple[float, float]] = []   # (score, weight)
        parts.append((min(1.0, (group.size - 1) / 4.0), 1.0))
        parts.append((float(np.mean((iv >= 0.1) & (iv <= 1.2))) if iv.size else 0.0, 1.0))

        if s.hits_from_audio and s.hits:
            in_group = [h.band_ratio for h in s.hits if group[0] - 1e-3 <= h.time <= group[-1] + 1e-3]
            if in_group:
                parts.append((min(1.0, float(np.mean(in_group)) / (2 * self.config.audio.min_band_ratio)), 0.5))

        if s.frame_times.size:
            lo = int(np.searchsorted(s.frame_times, group[0]))
            hi = int(np.searchsorted(s.frame_times, group[-1]))
            n_frames = max(hi - lo, 1)
            if s.ball:
                seen = sum(1 for b in s.ball if group[0] <= b.time <= group[-1])
                parts.append((min(1.0, seen / (0.5 * n_frames)), 1.0))
            if len(s.motion) and motion_ref > 0 and hi > lo:
                activity = float(np.mean(s.motion[lo:hi].sum(axis=1)))
                parts.append((float(np.clip(activity / (2 * motion_ref), 0, 1)), 0.75))

        total_w = sum(w for _, w in parts)
        return sum(p * w for p, w in parts) / total_w if total_w else 0.0

    def _resolve_overlaps(self, rallies: list[Rally]) -> list[Rally]:
        rallies.sort(key=lambda r: r.start)
        out: list[Rally] = []
        for r in rallies:
            if out and r.start < out[-1].end:
                # the next serve's pre-roll wins over the previous tail
                out[-1].end = max(out[-1].last_hit_time, r.start)
                if r.start < out[-1].end:
                    r.start = out[-1].end
            out.append(r)
        for i, r in enumerate(out):
            r.index = i
        return out


# ---------------------------------------------------------------- helpers
def _over_table(xy: tuple[float, float]) -> bool:
    x, y = xy
    m = _IN_PLAY_MARGIN_CM
    return -m <= x <= 274.0 + m and -m <= y <= 152.5 + m


def _crosses_net(ball: list[BallObservation], ball_t: np.ndarray, t0: float, t1: float) -> bool:
    lo, hi = int(np.searchsorted(ball_t, t0)), int(np.searchsorted(ball_t, t1))
    xs = [b.table_xy[0] for b in ball[lo:hi] if b.table_xy is not None and _over_table(b.table_xy)]
    if len(xs) < 2:
        return False
    sides = np.sign(np.asarray(xs) - 137.0)
    sides = sides[sides != 0]
    return bool(sides.size >= 2 and np.any(sides[1:] != sides[:-1]))


def visual_hits(ball: list[BallObservation], min_turn_deg: float = 60.0,
                min_gap_s: float = 0.1) -> list[AudioHit]:
    """Bounces and bat contacts as sharp turns in the ball trajectory (no audio)."""
    out: list[AudioHit] = []
    for a, b, c in zip(ball, ball[1:], ball[2:]):
        if c.time - a.time > 0.2:
            continue
        v1 = np.array([b.x - a.x, b.y - a.y])
        v2 = np.array([c.x - b.x, c.y - b.y])
        n1, n2 = np.linalg.norm(v1), np.linalg.norm(v2)
        if n1 < 1.0 or n2 < 1.0:
            continue
        turn = np.degrees(np.arccos(np.clip(v1 @ v2 / (n1 * n2), -1, 1)))
        if turn >= min_turn_deg and (not out or b.time - out[-1].time >= min_gap_s):
            out.append(AudioHit(time=b.time, strength=float(turn / 180.0), band_ratio=0.0))
    return out
