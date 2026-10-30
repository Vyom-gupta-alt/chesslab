"""Synthetic data generators for tests (no real footage needed)."""

from __future__ import annotations

import numpy as np

from ttvision.pose import kinematics as K
from ttvision.pose.analyzer import PoseSequence

SR = 22050


def click(sr: int = SR, freq: float = 3200.0, dur: float = 0.012, amp: float = 0.6) -> np.ndarray:
    t = np.arange(int(sr * dur)) / sr
    rng = np.random.default_rng(0)
    tone = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * (freq * 1.15) * t)
    return (amp * tone * np.exp(-t / 0.003) + 0.05 * rng.standard_normal(t.size) * np.exp(-t / 0.002)).astype(np.float32)


def thump(sr: int = SR, freq: float = 90.0, dur: float = 0.08, amp: float = 0.8) -> np.ndarray:
    t = np.arange(int(sr * dur)) / sr
    return (amp * np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.02)).astype(np.float32)


def audio_track(duration: float, clicks: list[float], thumps: list[float] = (), sr: int = SR,
                seed: int = 1) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(duration * sr)
    t = np.arange(n) / sr
    # background: room noise + a "voice" hum
    x = 0.01 * rng.standard_normal(n) + 0.03 * np.sin(2 * np.pi * 180 * t) * (np.sin(2 * np.pi * 0.3 * t) > 0)
    x = x.astype(np.float32)
    for at, src in [(c, click(sr)) for c in clicks] + [(c, thump(sr)) for c in thumps]:
        i = int(at * sr)
        x[i:i + src.size] += src[: max(0, n - i)]
    return x


def _ramp(t: np.ndarray, t0: float, t1: float) -> np.ndarray:
    """Smooth 0 -> 1 between t0 and t1 (cosine), peak speed at the midpoint."""
    u = np.clip((t - t0) / (t1 - t0), 0, 1)
    return 0.5 - 0.5 * np.cos(np.pi * u)


def swing_sequence(fps: float = 60.0, duration: float = 1.2, contact: float = 0.7,
                   forward_amp: float = 1.0, up_amp: float = 0.6, back_amp: float = 0.4,
                   knee_bend_deg: float = 30.0, hand: str = "right",
                   backswing_start: float = 0.2, backswing_end: float = 0.5) -> PoseSequence:
    """A standing player facing -z doing one swing with the chosen arm.

    up_amp > 0 = upward (topspin-like) swing, < 0 = downward (push/chop-like).
    """
    t = np.arange(0, duration, 1 / fps)
    T = len(t)
    w = np.zeros((T, 33, 3))
    fwd, up = np.array([0, 0, -1.0]), np.array([0, -1.0, 0])

    # person's right side is +x here; body_frame works out orientation itself
    w[:, K.R_HIP] = [0.1, 0, 0]
    w[:, K.L_HIP] = [-0.1, 0, 0]
    w[:, K.R_SHOULDER] = [0.18, -0.5, 0]
    w[:, K.L_SHOULDER] = [-0.18, -0.5, 0]
    w[:, K.NOSE] = [0, -0.68, -0.09]
    # knees bent forward by knee_bend_deg (thigh and shank 0.42 m)
    b = np.radians(knee_bend_deg)
    for side, x in ((K.R_KNEE, 0.1), (K.L_KNEE, -0.1)):
        w[:, side] = [x, 0.42 * np.cos(b / 2), -0.42 * np.sin(b / 2)]
    for side, x in ((K.R_ANKLE, 0.1), (K.L_ANKLE, -0.1)):
        w[:, side] = [x, 0.84 * np.cos(b / 2), 0.0]

    sgn = 1.0 if hand == "right" else -1.0
    sh, el, wr, ix = ((K.R_SHOULDER, K.R_ELBOW, K.R_WRIST, K.R_INDEX) if hand == "right"
                      else (K.L_SHOULDER, K.L_ELBOW, K.L_WRIST, K.L_INDEX))
    fsh, fel, fwr, fix = ((K.L_SHOULDER, K.L_ELBOW, K.L_WRIST, K.L_INDEX) if hand == "right"
                          else (K.R_SHOULDER, K.R_ELBOW, K.R_WRIST, K.R_INDEX))

    half = contact - backswing_end
    g_back = _ramp(t, backswing_start, backswing_end)
    g_fwd = _ramp(t, backswing_end, contact + half)
    wrist0 = np.array([sgn * 0.45, -0.1, -0.25])
    d_back = -fwd * back_amp + (-up) * 0.15
    d_fwd = fwd * forward_amp + up * up_amp + np.array([-sgn * 0.2, 0, 0])
    w[:, wr] = wrist0 + np.outer(g_back, d_back) + np.outer(g_fwd, d_fwd)
    shoulder = w[:, sh]
    mid = (shoulder + w[:, wr]) / 2
    w[:, el] = mid + np.array([sgn * 0.08, 0.1, 0.05])          # elbow bent outward/down
    w[:, ix] = w[:, wr] + 0.08 * (w[:, wr] - w[:, el]) / np.linalg.norm(w[:, wr] - w[:, el], axis=1, keepdims=True)

    # free arm: still, in front of the body
    w[:, fel] = w[:, fsh] + [-sgn * 0.05, 0.25, -0.1]
    w[:, fwr] = w[:, fel] + [sgn * 0.05, 0.0, -0.25]
    w[:, fix] = w[:, fwr] + [0, 0, -0.08]

    image = np.zeros((T, 33, 3))
    image[:, :, 0] = 0.5 + w[:, :, 0] * 0.3
    image[:, :, 1] = 0.5 + w[:, :, 1] * 0.3
    image[:, :, 2] = 1.0
    return PoseSequence(t, w.astype(np.float32), image.astype(np.float32), np.ones(T, bool))
