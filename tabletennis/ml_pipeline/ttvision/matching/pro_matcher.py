"""ProMatcher: compare a user's stroke against a library of pro strokes.

* Each stroke becomes a per-frame feature sequence (torso-normalised joint
  positions in the player's own body frame + key joint angles + racket path).
  Left-handers are mirrored so they compare with right-handed pros.
* Sequences are resampled phase-by-phase (preparation -> contact gets 60 % of
  the samples, contact -> follow-through 40 %) so contact lines up before
  alignment.
* Dynamic Time Warping (Sakoe-Chiba band) with cosine distance aligns the
  two; similarity = mean cosine similarity along the warping path.
* Scalar metrics (knee bend, elbow at contact, rotation...) are compared
  directly and turned into coaching cues.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

import numpy as np

from ..config import MatcherConfig
from ..pose.analyzer import PoseAnalyzer, PoseSequence, StrokeAnalysis

_JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
_ANGLES = ["elbow", "shoulder_abduction", "knee_flexion", "x_factor", "trunk_lean"]

# metric -> (label, unit, tolerance before we comment, cue if user < pro, cue if user > pro)
METRIC_CUES: dict[str, tuple[str, str, float, str, str]] = {
    "knee_flexion_at_backswing": ("Knee bend at backswing", "°", 6.0,
                                  "Bend your knees more as you load", "Stand a little taller in the backswing"),
    "elbow_at_contact": ("Elbow angle at contact", "°", 8.0,
                         "Open the elbow more at contact", "Keep the elbow more bent at contact"),
    "elbow_at_backswing": ("Elbow angle at backswing", "°", 10.0,
                           "Extend the arm more in the backswing", "Keep the arm more compact in the backswing"),
    "hip_rotation_range": ("Hip rotation", "°", 8.0,
                           "Turn the hips more", "Less hip rotation; stay balanced"),
    "shoulder_rotation_range": ("Shoulder rotation", "°", 8.0,
                                "Rotate the shoulders more", "Shorter shoulder turn"),
    "x_factor_max": ("Trunk twist (shoulders vs hips)", "°", 6.0,
                     "Coil the upper body more against the hips", "Less trunk twist"),
    "trunk_lean_at_contact": ("Forward lean at contact", "°", 6.0,
                              "Lean forward more into the ball", "Stay more upright"),
    "swing_angle_at_contact": ("Racket path angle at contact", "°", 8.0,
                               "Swing more upward through the ball", "Swing more forward, less upward"),
    "racket_speed_peak": ("Racket speed (rel. to hips)", "m/s", 0.8,
                          "Accelerate more into contact", "Control the swing speed"),
    "contact_forward_of_com": ("Contact in front of body", "m", 0.06,
                               "Meet the ball further in front", "Let the ball come closer"),
    "knee_flexion_at_contact": ("Knee bend at contact", "°", 6.0,
                                "Stay lower through contact", "Drive up a bit more through contact"),
}


@dataclass
class ProStroke:
    id: str
    player: str
    stroke_type: str
    context: str                      # e.g. "vs_backspin", "vs_topspin"
    analysis: StrokeAnalysis
    video_url: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class MatchResult:
    pro: ProStroke
    similarity: float                 # 0..1, mean cosine similarity on the DTW path
    dtw_cost: float
    path: list[tuple[int, int]]       # aligned (user_frame, pro_frame) pairs (resampled)
    racket_path_error: float          # mean distance, torso lengths
    metric_diffs: dict[str, dict[str, Any]]
    cues: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "pro_id": self.pro.id, "player": self.pro.player,
            "stroke_type": self.pro.stroke_type, "context": self.pro.context,
            "video_url": self.pro.video_url,
            "similarity": round(self.similarity, 4), "dtw_cost": round(self.dtw_cost, 4),
            "racket_path_error": round(self.racket_path_error, 4),
            "metric_diffs": self.metric_diffs, "cues": self.cues,
            "path": self.path,
        }


# --------------------------------------------------------------------- features
def _torso_length(world: np.ndarray) -> float:
    hip = world[:, [23, 24]].mean(axis=1)
    sh = world[:, [11, 12]].mean(axis=1)
    return float(np.linalg.norm(sh - hip, axis=1).mean()) or 1.0


def _resample(x: np.ndarray, n: int) -> np.ndarray:
    if len(x) == 1:
        return np.repeat(x, n, axis=0)
    src, dst = np.linspace(0, 1, len(x)), np.linspace(0, 1, n)
    flat = x.reshape(len(x), -1)
    out = np.stack([np.interp(dst, src, flat[:, j]) for j in range(flat.shape[1])], axis=1)
    return out.reshape((n,) + x.shape[1:])


def phase_resample(x: np.ndarray, a: StrokeAnalysis, length: int) -> np.ndarray:
    p = a.phases
    n_pre = max(2, int(round(length * 0.6)))
    pre = _resample(x[p.prep_start:p.contact + 1], n_pre)
    post = _resample(x[p.contact:p.follow_end + 1], length - n_pre + 1)[1:]
    return np.concatenate([pre, post], axis=0)


def feature_sequence(a: StrokeAnalysis, length: int) -> np.ndarray:
    from ..pose import kinematics as K

    world = a.world
    arm = K.Arm.for_hand(a.handedness)
    fwd, lat, up = K.body_frame(world, arm)
    com = K.centre_of_mass(world)
    rel = world[:, _JOINTS] - com[:, None]
    body = np.stack([(rel * fwd[:, None]).sum(-1), (rel * lat[:, None]).sum(-1),
                     (rel * up[:, None]).sum(-1)], axis=-1)       # (T, J, 3)
    torso = _torso_length(world)
    joints = (body / torso).reshape(len(world), -1)
    angles = np.stack([np.radians(a.angles[k]) for k in _ANGLES], axis=1)
    racket = a.racket_body / torso
    feats = np.concatenate([joints, angles, racket], axis=1)
    return phase_resample(feats, a, length)


# -------------------------------------------------------------------------- DTW
def cosine_distance_matrix(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    an = a / np.maximum(np.linalg.norm(a, axis=1, keepdims=True), 1e-9)
    bn = b / np.maximum(np.linalg.norm(b, axis=1, keepdims=True), 1e-9)
    return 1.0 - an @ bn.T


def dtw(cost: np.ndarray, band_ratio: float = 0.2) -> tuple[float, list[tuple[int, int]]]:
    """Dynamic Time Warping over a precomputed cost matrix (Sakoe-Chiba band).

    Returns (normalised path cost, path).
    """
    n, m = cost.shape
    band = max(int(band_ratio * max(n, m)), abs(n - m)) + 1
    acc = np.full((n + 1, m + 1), np.inf)
    acc[0, 0] = 0.0
    for i in range(1, n + 1):
        centre = int(round(i * m / n))
        lo, hi = max(1, centre - band), min(m, centre + band)
        for j in range(lo, hi + 1):
            acc[i, j] = cost[i - 1, j - 1] + min(acc[i - 1, j], acc[i, j - 1], acc[i - 1, j - 1])
    # backtrack
    i, j = n, m
    path = [(i - 1, j - 1)]
    while i > 1 or j > 1:
        steps = [(acc[i - 1, j - 1], i - 1, j - 1), (acc[i - 1, j], i - 1, j), (acc[i, j - 1], i, j - 1)]
        _, i, j = min((s for s in steps if s[1] >= 1 and s[2] >= 1), key=lambda s: s[0])
        path.append((i - 1, j - 1))
    path.reverse()
    total = float(sum(cost[p] for p in path))
    return total / len(path), path


# ------------------------------------------------------------------------ library
class ProLibrary:
    """JSON files, one per pro stroke:

    {"id", "player", "stroke_type", "context", "handedness", "video_url",
     "times": [...], "world": [[[x,y,z]*33]*T], "image": [...], "contact_time"}
    """

    def __init__(self, strokes: Iterable[ProStroke] = ()):
        self.strokes = list(strokes)

    @classmethod
    def load(cls, directory: str | Path, analyzer: PoseAnalyzer | None = None) -> "ProLibrary":
        analyzer = analyzer or PoseAnalyzer()
        items = []
        for path in sorted(Path(directory).glob("*.json")):
            d = json.loads(path.read_text())
            times = np.asarray(d["times"], float)
            world = np.asarray(d["world"], np.float32)
            image = np.asarray(d.get("image") or np.zeros_like(world), np.float32)
            seq = PoseSequence(times, world, image, np.ones(len(times), bool))
            seq.image[:, :, 2] = np.where(seq.image[:, :, 2] > 0, seq.image[:, :, 2], 1.0)
            a = analyzer.analyze_single(seq, d.get("contact_time"), d.get("handedness"))
            items.append(ProStroke(
                id=d["id"], player=d.get("player", "unknown"), stroke_type=d["stroke_type"],
                context=d.get("context", "any"), analysis=a, video_url=d.get("video_url"),
                meta={k: v for k, v in d.items() if k not in {"times", "world", "image"}},
            ))
        return cls(items)

    @staticmethod
    def save(path: str | Path, seq: PoseSequence, *, id: str, player: str, stroke_type: str,
             context: str = "any", handedness: str = "right", contact_time: float | None = None,
             video_url: str | None = None) -> None:
        Path(path).write_text(json.dumps({
            "id": id, "player": player, "stroke_type": stroke_type, "context": context,
            "handedness": handedness, "contact_time": contact_time, "video_url": video_url,
            "times": np.round(seq.times, 4).tolist(),
            "world": np.round(seq.world, 4).tolist(),
            "image": np.round(seq.image, 4).tolist(),
        }))

    def filter(self, stroke_type: str | None = None, context: str | None = None) -> list[ProStroke]:
        return [p for p in self.strokes
                if (stroke_type is None or p.stroke_type == stroke_type)
                and (context is None or p.context in (context, "any"))]


# ------------------------------------------------------------------------ matcher
class ProMatcher:
    def __init__(self, library: ProLibrary, config: MatcherConfig | None = None):
        self.library = library
        self.cfg = config or MatcherConfig()

    def compare(self, user: StrokeAnalysis, pro: ProStroke) -> MatchResult:
        L = self.cfg.resample_length
        fu, fp = feature_sequence(user, L), feature_sequence(pro.analysis, L)
        cost, path = dtw(cosine_distance_matrix(fu, fp), self.cfg.dtw_band_ratio)

        ru = phase_resample(user.racket_body, user, L) / _torso_length(user.world)
        rp = phase_resample(pro.analysis.racket_body, pro.analysis, L) / _torso_length(pro.analysis.world)
        racket_err = float(np.mean([np.linalg.norm(ru[i] - rp[j]) for i, j in path]))

        diffs, cues = self.metric_report(user.metrics, pro.analysis.metrics)
        return MatchResult(pro=pro, similarity=float(1.0 - cost), dtw_cost=cost,
                           path=[(int(i), int(j)) for i, j in path],
                           racket_path_error=racket_err, metric_diffs=diffs, cues=cues)

    def match(self, user: StrokeAnalysis, stroke_type: str | None = None,
              context: str | None = None, top_k: int | None = None) -> list[MatchResult]:
        candidates = self.library.filter(stroke_type, context)
        results = [self.compare(user, p) for p in candidates]
        results.sort(key=lambda r: r.similarity, reverse=True)
        return results[: top_k or self.cfg.top_k]

    @staticmethod
    def metric_report(user: dict[str, float], pro: dict[str, float]):
        diffs: dict[str, dict[str, Any]] = {}
        ranked: list[tuple[float, str]] = []
        for key, (label, unit, tol, cue_low, cue_high) in METRIC_CUES.items():
            if key not in user or key not in pro:
                continue
            delta = float(user[key] - pro[key])
            diffs[key] = {"label": label, "unit": unit, "user": user[key], "pro": pro[key],
                          "delta": round(delta, 3), "within_tolerance": abs(delta) <= tol}
            if abs(delta) > tol:
                cue = cue_low if delta < 0 else cue_high
                ranked.append((abs(delta) / tol, f"{cue} ({label.lower()}: {user[key]:.1f}{unit} "
                                                 f"vs pro {pro[key]:.1f}{unit})"))
        ranked.sort(reverse=True)
        return diffs, [c for _, c in ranked[:4]]
