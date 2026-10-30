"""PoseAnalyzer: from video (or a landmark sequence) to per-stroke breakdowns.

For each stroke it produces:
* phase boundaries (preparation/backswing, contact, follow-through),
* joint angles at each keyframe (elbow, knee bend, hip & shoulder rotation...),
* the contact point relative to the centre of mass, in the player's body frame,
* the racket path through the stroke (for the comparison view and ProMatcher).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence

import numpy as np

from ..config import PoseConfig
from ..types import PhaseKeyframe, StrokeEvent, StrokePhase, StrokeType
from . import kinematics as K
from .estimator import PersonPose, PoseEstimator, select_player
from .phases import PhaseIndices, find_stroke_peaks, segment_phases


@dataclass
class PoseSequence:
    times: np.ndarray       # (T,)
    world: np.ndarray       # (T, 33, 3)
    image: np.ndarray       # (T, 33, 3)
    valid: np.ndarray       # (T,) bool

    def slice(self, lo: int, hi: int) -> "PoseSequence":
        return PoseSequence(self.times[lo:hi], self.world[lo:hi], self.image[lo:hi], self.valid[lo:hi])

    @staticmethod
    def from_people(times: Sequence[float], people: Sequence[PersonPose | None]) -> "PoseSequence":
        t = np.asarray(times, dtype=float)
        world = np.zeros((len(t), 33, 3), np.float32)
        image = np.zeros((len(t), 33, 3), np.float32)
        valid = np.zeros(len(t), bool)
        for i, p in enumerate(people):
            if p is not None:
                world[i], image[i], valid[i] = p.world, p.image, True
        return PoseSequence(t, world, image, valid)


@dataclass
class StrokeAnalysis:
    contact_time: float
    handedness: str
    phases: PhaseIndices
    times: np.ndarray                 # stroke window
    world: np.ndarray                 # (T, 33, 3) cleaned landmarks
    image: np.ndarray                 # (T, 33, 3) for drawing the skeleton
    angles: dict[str, np.ndarray]
    racket_body: np.ndarray           # (T, 3) racket rel. to COM: forward, lateral, up
    racket_speed: np.ndarray          # (T,)
    metrics: dict[str, float] = field(default_factory=dict)

    def keyframes(self) -> list[PhaseKeyframe]:
        out = []
        for phase, idx in ((StrokePhase.PREPARATION, self.phases.backswing_end),
                           (StrokePhase.CONTACT, self.phases.contact),
                           (StrokePhase.FOLLOW_THROUGH, self.phases.follow_end)):
            out.append(PhaseKeyframe(
                phase=phase, time=float(self.times[idx]), frame_index=int(idx),
                angles={k: round(float(v[idx]), 1) for k, v in self.angles.items()},
            ))
        return out

    def to_event(self, stroke_type: StrokeType = StrokeType.UNKNOWN,
                 confidence: float = 0.0) -> StrokeEvent:
        return StrokeEvent(
            time=self.contact_time, stroke_type=stroke_type, confidence=confidence,
            handedness=self.handedness,
            start=float(self.times[self.phases.prep_start]),
            end=float(self.times[self.phases.follow_end]),
            keyframes=self.keyframes(), metrics=self.metrics,
        )

    def skeleton_track(self) -> dict[str, Any]:
        """Compact 2D track for the frontend canvas overlay."""
        return {
            "times": np.round(self.times, 4).tolist(),
            "landmarks": np.round(self.image, 4).tolist(),
            "edges": K.SKELETON_EDGES,
            "phases": self.phases.as_dict(),
        }


class PoseAnalyzer:
    def __init__(self, config: PoseConfig | None = None, estimator: PoseEstimator | None = None):
        self.cfg = config or PoseConfig()
        self._estimator = estimator

    @property
    def estimator(self) -> PoseEstimator:
        if self._estimator is None:
            from .estimator import MediaPipePoseEstimator

            self._estimator = MediaPipePoseEstimator(self.cfg)
        return self._estimator

    def close(self) -> None:
        """Release the pose model (MediaPipe complains if it is left to the GC at exit)."""
        if self._estimator is not None and hasattr(self._estimator, "close"):
            self._estimator.close()
        self._estimator = None

    def __enter__(self) -> "PoseAnalyzer":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    # ------------------------------------------------------------ video input
    def track(self, video_path: str | Path, start: float, end: float,
              max_fps: float = 60.0, width: int = 960) -> PoseSequence:
        """Run pose estimation on [start, end] and follow the target player."""
        from ..vision.video import VideoReader

        times, people = [], []
        prev: PersonPose | None = None
        with VideoReader(video_path, analysis_width=width, max_fps=max_fps) as reader:
            for frame in reader.frames(start, end):
                found = self.estimator.estimate(frame.image, int(frame.time * 1000))
                person = select_player(found, self.cfg.target_player, prev)
                prev = person or prev
                times.append(frame.time)
                people.append(person)
        return PoseSequence.from_people(times, people)

    def analyze_video(self, video_path: str | Path, windows: Sequence[tuple[float, float]],
                      hit_times: Sequence[float] = ()) -> list[StrokeAnalysis]:
        out: list[StrokeAnalysis] = []
        for start, end in windows:
            seq = self.track(video_path, start, end)
            hints = [t for t in hit_times if start <= t <= end]
            out.extend(self.analyze_sequence(seq, hints))
        return out

    # ---------------------------------------------------------- sequence input
    def analyze_sequence(self, seq: PoseSequence,
                         contact_hints: Sequence[float] = ()) -> list[StrokeAnalysis]:
        """Find strokes in a landmark sequence and break each one down."""
        if seq.valid.sum() < 5:
            return []
        world = self._clean(seq)
        hand = self._handedness(world, seq.times)
        arm = K.Arm.for_hand(hand)
        racket = K.racket_position(world, arm, self.cfg.forearm_extension)
        vel = K.velocity(racket, seq.times)
        speed = np.linalg.norm(vel, axis=1)
        fwd, _, _ = K.body_frame(world, arm)
        forward_speed = (vel * fwd).sum(-1)

        # a stroke's speed peak happens while the racket moves forward;
        # this drops backswings and recovery movements
        peaks = [p for p in find_stroke_peaks(seq.times, speed, self.cfg.min_racket_speed)
                 if forward_speed[p] > 0.2 * speed[p]]
        if contact_hints:
            # keep speed peaks that agree with a ball-contact sound (+-0.12 s)
            hints = np.asarray(sorted(contact_hints))
            peaks = [p for p in peaks if np.min(np.abs(hints - seq.times[p])) <= 0.12] or peaks

        results = []
        for p in peaks:
            t = float(seq.times[p])
            lo = int(np.searchsorted(seq.times, t - self.cfg.stroke_window_pre_s))
            hi = int(np.searchsorted(seq.times, t + self.cfg.stroke_window_post_s, side="right"))
            if hi - lo < 5:
                continue
            results.append(self._analyze_window(seq, world, lo, hi, arm, t))
        return results

    def analyze_single(self, seq: PoseSequence, contact_time: float | None = None,
                       handedness: str | None = None) -> StrokeAnalysis:
        """Treat the whole sequence as one stroke (used for pro reference clips)."""
        world = self._clean(seq)
        hand = handedness or self._handedness(world, seq.times)
        arm = K.Arm.for_hand(hand)
        if contact_time is None:
            racket = K.racket_position(world, arm, self.cfg.forearm_extension)
            speed = np.linalg.norm(K.velocity(racket, seq.times), axis=1)
            contact_time = float(seq.times[int(np.argmax(speed))])
        return self._analyze_window(seq, world, 0, len(seq.times), arm, contact_time)

    # -------------------------------------------------------------- internals
    def _clean(self, seq: PoseSequence) -> np.ndarray:
        valid = seq.valid.copy()
        vis = seq.image[:, :, 2]
        key = [K.L_SHOULDER, K.R_SHOULDER, K.L_HIP, K.R_HIP]
        valid &= vis[:, key].mean(axis=1) >= self.cfg.min_visibility * 0.6
        world = K.fill_gaps(seq.world.astype(float), valid if valid.any() else seq.valid)
        return K.smooth(world, self.cfg.smoothing_window)

    def _handedness(self, world: np.ndarray, times: np.ndarray) -> str:
        if self.cfg.handedness in ("left", "right"):
            return self.cfg.handedness
        peaks = {}
        for hand in ("right", "left"):
            arm = K.Arm.for_hand(hand)
            r = K.racket_position(world, arm, self.cfg.forearm_extension)
            peaks[hand] = float(np.percentile(np.linalg.norm(K.velocity(r, times), axis=1), 95))
        return max(peaks, key=peaks.get)

    def _analyze_window(self, seq: PoseSequence, world_all: np.ndarray, lo: int, hi: int,
                        arm: K.Arm, contact_time: float) -> StrokeAnalysis:
        times = seq.times[lo:hi]
        world = world_all[lo:hi]
        racket = K.racket_position(world, arm, self.cfg.forearm_extension)
        vel = K.velocity(racket, times)
        speed = np.linalg.norm(vel, axis=1)
        phases = segment_phases(times, speed, contact_time)

        angles = K.joint_angles(world, arm)
        com = K.centre_of_mass(world)
        fwd, lat, up = K.body_frame(world, arm)
        rel = racket - com
        racket_body = np.stack([(rel * fwd).sum(-1), (rel * lat).sum(-1), (rel * up).sum(-1)], axis=1)

        c, b, f = phases.contact, phases.backswing_end, phases.follow_end
        vc = vel[c]
        v_fwd, v_lat, v_up = float(vc @ fwd[c]), float(vc @ lat[c]), float(vc @ up[c])
        horiz = float(np.hypot(v_fwd, v_lat))
        seg = slice(phases.prep_start, f + 1)

        metrics = {
            "elbow_at_backswing": angles["elbow"][b],
            "elbow_at_contact": angles["elbow"][c],
            "elbow_at_follow_through": angles["elbow"][f],
            "knee_flexion_at_backswing": angles["knee_flexion"][b],
            "knee_flexion_at_contact": angles["knee_flexion"][c],
            "knee_flexion_max": float(np.max(angles["knee_flexion"][seg])),
            "hip_rotation_range": float(np.ptp(angles["hip_rotation"][seg])),
            "shoulder_rotation_range": float(np.ptp(angles["shoulder_rotation"][seg])),
            "x_factor_max": float(np.max(np.abs(angles["x_factor"][seg] - angles["x_factor"][phases.prep_start]))),
            "trunk_lean_at_contact": angles["trunk_lean"][c],
            "racket_speed_peak": float(speed[c]),
            "swing_angle_at_contact": float(np.degrees(np.arctan2(v_up, max(horiz, 1e-6)))),
            "swing_lateral_velocity": v_lat,
            "swing_forward_velocity": v_fwd,
            "contact_forward_of_com": float(racket_body[c, 0]),
            "contact_lateral_of_com": float(racket_body[c, 1]),
            "contact_height_vs_com": float(racket_body[c, 2]),
            "elbow_height_vs_shoulder": float((world[c, arm.elbow] - world[c, arm.shoulder]) @ K.UP),
            "backswing_duration": float(times[c] - times[phases.prep_start]),
            "follow_through_duration": float(times[f] - times[c]),
            "backswing_depth": float(racket_body[c, 0] - racket_body[b, 0]),
        }
        metrics = {k: round(float(v), 3) for k, v in metrics.items()}

        return StrokeAnalysis(
            contact_time=float(times[c]), handedness=arm.side, phases=phases,
            times=times, world=world, image=seq.image[lo:hi], angles=angles,
            racket_body=racket_body, racket_speed=speed, metrics=metrics,
        )
