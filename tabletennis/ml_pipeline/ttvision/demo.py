"""Synthetic reference strokes.

These are generated from a simple kinematic model, NOT recorded from a real
player. They exist so the comparison tools work before a real pro library is
added (`ttvision add-pro`), and every entry is labelled as synthetic.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from .matching.pro_matcher import ProLibrary
from .pose import kinematics as K
from .pose.analyzer import PoseSequence

SYNTHETIC_PLAYER = "Synthetic reference (not a real player)"


def _ramp(t: np.ndarray, t0: float, t1: float) -> np.ndarray:
    u = np.clip((t - t0) / (t1 - t0), 0, 1)
    return 0.5 - 0.5 * np.cos(np.pi * u)


def synthetic_swing(fps: float = 60.0, duration: float = 1.2, contact: float = 0.7,
                    forward_amp: float = 1.0, up_amp: float = 0.6, back_amp: float = 0.4,
                    lateral_amp: float = -0.2, knee_bend_deg: float = 30.0, hand: str = "right",
                    backswing_start: float = 0.2, backswing_end: float = 0.5,
                    wrist_side: float = 0.45) -> PoseSequence:
    """One swing of a standing player facing -z (world) / the camera.

    up_amp > 0 = upward (topspin-like) path, < 0 = downward (push/chop-like).
    wrist_side < 0 puts the racket on the free-arm side (backhand).
    """
    t = np.arange(0, duration, 1 / fps)
    T = len(t)
    w = np.zeros((T, 33, 3))
    fwd, up = np.array([0, 0, -1.0]), np.array([0, -1.0, 0])
    w[:, K.R_HIP], w[:, K.L_HIP] = [0.1, 0, 0], [-0.1, 0, 0]
    w[:, K.R_SHOULDER], w[:, K.L_SHOULDER] = [0.18, -0.5, 0], [-0.18, -0.5, 0]
    w[:, K.NOSE] = [0, -0.68, -0.09]
    w[:, 7], w[:, 8] = [-0.07, -0.66, 0], [0.07, -0.66, 0]           # ears (drawing only)
    b = np.radians(knee_bend_deg)
    for knee, ankle, x in ((K.R_KNEE, K.R_ANKLE, 0.1), (K.L_KNEE, K.L_ANKLE, -0.1)):
        w[:, knee] = [x, 0.42 * np.cos(b / 2), -0.42 * np.sin(b / 2)]
        w[:, ankle] = [x, 0.84 * np.cos(b / 2), 0.0]
    for heel, toe, ankle in ((29, 31, K.L_ANKLE), (30, 32, K.R_ANKLE)):
        w[:, heel] = w[:, ankle] + [0, 0.04, 0.05]
        w[:, toe] = w[:, ankle] + [0, 0.05, -0.12]

    sgn = 1.0 if hand == "right" else -1.0
    arm = K.Arm.for_hand(hand)
    free = K.Arm.for_hand("left" if hand == "right" else "right")
    half = contact - backswing_end
    g_back = _ramp(t, backswing_start, backswing_end)
    g_fwd = _ramp(t, backswing_end, contact + half)
    wrist0 = np.array([sgn * wrist_side, -0.1, -0.25])
    d_back = -fwd * back_amp + (-up) * 0.15
    d_fwd = fwd * forward_amp + up * up_amp + np.array([sgn * lateral_amp, 0, 0])
    w[:, arm.wrist] = wrist0 + np.outer(g_back, d_back) + np.outer(g_fwd, d_fwd)
    mid = (w[:, arm.shoulder] + w[:, arm.wrist]) / 2
    w[:, arm.elbow] = mid + np.array([sgn * 0.08, 0.1, 0.05])
    fa = w[:, arm.wrist] - w[:, arm.elbow]
    w[:, arm.index] = w[:, arm.wrist] + 0.08 * fa / np.linalg.norm(fa, axis=1, keepdims=True)
    w[:, free.elbow] = w[:, free.shoulder] + [-sgn * 0.05, 0.25, -0.1]
    w[:, free.wrist] = w[:, free.elbow] + [sgn * 0.05, 0.0, -0.25]
    w[:, free.index] = w[:, free.wrist] + [0, 0, -0.08]

    # simple front-facing projection for the 2D track (person's right on image left)
    image = np.zeros((T, 33, 3))
    image[:, :, 0] = 0.5 - w[:, :, 0] * 0.35 + w[:, :, 2] * 0.05
    image[:, :, 1] = 0.45 + w[:, :, 1] * 0.35
    image[:, :, 2] = 1.0
    return PoseSequence(t, w.astype(np.float32), image.astype(np.float32), np.ones(T, bool))


DEMO_STROKES = {
    "synthetic_fh_topspin": dict(stroke_type="forehand_topspin", context="vs_backspin",
                                 kw=dict(up_amp=0.7, forward_amp=1.1, knee_bend_deg=38)),
    "synthetic_bh_topspin": dict(stroke_type="backhand_topspin", context="vs_backspin",
                                 kw=dict(up_amp=0.55, forward_amp=0.9, knee_bend_deg=32,
                                         wrist_side=-0.15, lateral_amp=0.35)),
    "synthetic_fh_push": dict(stroke_type="forehand_push", context="vs_backspin",
                              kw=dict(up_amp=-0.25, forward_amp=0.5, back_amp=0.15, knee_bend_deg=30)),
    "synthetic_bh_push": dict(stroke_type="backhand_push", context="vs_backspin",
                              kw=dict(up_amp=-0.25, forward_amp=0.5, back_amp=0.15, knee_bend_deg=30,
                                      wrist_side=-0.15, lateral_amp=0.1)),
}


def write_demo_library(directory: str | Path) -> list[Path]:
    out_dir = Path(directory)
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for sid, spec in DEMO_STROKES.items():
        path = out_dir / f"{sid}.json"
        ProLibrary.save(path, synthetic_swing(**spec["kw"]), id=sid, player=SYNTHETIC_PLAYER,
                        stroke_type=spec["stroke_type"], context=spec["context"],
                        handedness="right", extra={"synthetic": True})
        paths.append(path)
    return paths
