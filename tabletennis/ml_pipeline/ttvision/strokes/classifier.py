"""Stroke classification.

Two layers:

1. `rule_based_label` uses the biomechanics from PoseAnalyzer (side of the
   body at contact, racket path angle, racket speed, contact height, elbow
   height) plus rally context (is this the serve? the receive?). It works with
   no training data and gives sensible labels for the filter tabs.
2. `TemporalStrokeNet` is a small GRU over per-frame pose features. Once
   labelled clips exist (the rule-based labels, corrected in the UI, are a
   good start), train it and pass `model_path` to `StrokeClassifier`.

The rule thresholds are starting points for a typical club camera setup and
should be calibrated on labelled footage.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ..pose.analyzer import StrokeAnalysis
from ..types import StrokeType


@dataclass
class StrokeContext:
    is_serve: bool = False
    is_receive: bool = False


def rule_based_label(m: dict[str, float], ctx: StrokeContext) -> tuple[StrokeType, float]:
    speed = m["racket_speed_peak"]
    angle = m["swing_angle_at_contact"]          # + = racket moving up through contact
    lateral = m["contact_lateral_of_com"]        # + = playing-arm side (forehand)
    height = m["contact_height_vs_com"]
    depth = m["backswing_depth"]
    forehand = lateral >= -0.02

    def conf(margin: float, scale: float) -> float:
        return float(np.clip(0.5 + margin / scale, 0.35, 0.95))

    if ctx.is_serve:
        if not forehand:
            return StrokeType.SERVE_BACKHAND, conf(-lateral, 0.2)
        if m["elbow_height_vs_shoulder"] > -0.12:
            return StrokeType.SERVE_TOMAHAWK, conf(m["elbow_height_vs_shoulder"] + 0.12, 0.2)
        # pendulum swings across the body (towards the free-arm side)
        lat_v = m["swing_lateral_velocity"]
        if lat_v < 0:
            return StrokeType.SERVE_PENDULUM, conf(-lat_v, 2.0)
        return StrokeType.SERVE_REVERSE_PENDULUM, conf(lat_v, 2.0)

    if ctx.is_receive:
        if angle > 15 and speed >= 3.5:
            if depth < 0.25:
                return StrokeType.RECEIVE_SHORT_FLICK, conf(angle - 15, 30)
            return StrokeType.RECEIVE_LONG_FLICK, conf(angle - 15, 30)
        if angle <= 5 and speed < 5.0:
            return StrokeType.RECEIVE_PUSH, conf(5 - angle, 30)

    if height > 0.45 and angle < -10 and speed >= 7.0:
        return StrokeType.SMASH, conf(speed - 7.0, 4.0)
    if angle > 40 and height > 0.2:
        return StrokeType.LOB, conf(angle - 40, 30)
    if angle < -10:
        if speed >= 4.5:
            return StrokeType.CHOP, conf(-angle - 10, 30)
        push = StrokeType.FOREHAND_PUSH if forehand else StrokeType.BACKHAND_PUSH
        return push, conf(4.5 - speed, 3.0)
    if speed < 3.5 and depth < 0.15:
        return StrokeType.BLOCK, conf(3.5 - speed, 2.0)
    if angle > 20 and speed >= 4.5:
        loop = StrokeType.FOREHAND_TOPSPIN if forehand else StrokeType.BACKHAND_TOPSPIN
        return loop, conf(angle - 20, 25)
    if speed >= 4.5:
        return StrokeType.COUNTER_DRIVE, conf(20 - abs(angle - 5), 30)
    if angle > 10:
        loop = StrokeType.FOREHAND_TOPSPIN if forehand else StrokeType.BACKHAND_TOPSPIN
        return loop, 0.4
    return StrokeType.BLOCK, 0.4


# ------------------------------------------------------------------ learned model
LABELS = [t for t in StrokeType if t is not StrokeType.UNKNOWN]
_FEATURE_JOINTS = [11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28]
_ANGLE_KEYS = ["elbow", "shoulder_abduction", "knee_flexion", "hip_rotation",
               "shoulder_rotation", "x_factor", "trunk_lean"]
SEQ_LEN = 48


def sequence_features(a: StrokeAnalysis, length: int = SEQ_LEN) -> np.ndarray:
    """(length, F) per-frame features: torso-normalised joints + angles + racket."""
    world = a.world
    hip = world[:, [23, 24]].mean(axis=1, keepdims=True)
    torso = np.linalg.norm(world[:, [11, 12]].mean(axis=1) - hip[:, 0], axis=1).mean() or 1.0
    joints = ((world[:, _FEATURE_JOINTS] - hip) / torso).reshape(len(world), -1)
    if a.handedness == "left":   # mirror so left-handers look like right-handers
        joints = joints.reshape(len(world), -1, 3)
        joints[:, :, 0] *= -1
        joints = joints.reshape(len(world), -1)
    angles = np.stack([a.angles[k] / 180.0 for k in _ANGLE_KEYS], axis=1)
    feats = np.concatenate([joints, angles, a.racket_body / torso,
                            a.racket_speed[:, None] / 10.0], axis=1)
    src = np.linspace(0, 1, len(feats))
    dst = np.linspace(0, 1, length)
    return np.stack([np.interp(dst, src, feats[:, j]) for j in range(feats.shape[1])], axis=1)


def build_temporal_net(n_features: int, n_classes: int = len(LABELS), hidden: int = 128):
    import torch.nn as nn

    class TemporalStrokeNet(nn.Module):
        def __init__(self):
            super().__init__()
            self.conv = nn.Sequential(
                nn.Conv1d(n_features, hidden, 5, padding=2), nn.BatchNorm1d(hidden), nn.ReLU(),
                nn.Conv1d(hidden, hidden, 5, padding=2), nn.BatchNorm1d(hidden), nn.ReLU(),
            )
            self.gru = nn.GRU(hidden, hidden, batch_first=True, bidirectional=True)
            self.head = nn.Sequential(nn.Dropout(0.3), nn.Linear(2 * hidden, n_classes))

        def forward(self, x):                      # x: (B, T, F)
            h = self.conv(x.transpose(1, 2)).transpose(1, 2)
            out, _ = self.gru(h)
            return self.head(out.mean(dim=1))

    return TemporalStrokeNet()


class StrokeClassifier:
    def __init__(self, model_path: str | Path | None = None, device: str = "cpu"):
        self.model = None
        self.device = device
        if model_path:
            import torch

            ckpt = torch.load(model_path, map_location=device)
            self.model = build_temporal_net(ckpt["n_features"])
            self.model.load_state_dict(ckpt["state_dict"])
            self.model.eval().to(device)

    def classify(self, a: StrokeAnalysis, ctx: StrokeContext | None = None) -> tuple[StrokeType, float]:
        ctx = ctx or StrokeContext()
        rule_label, rule_conf = rule_based_label(a.metrics, ctx)
        if self.model is None:
            return rule_label, rule_conf

        import torch

        x = torch.from_numpy(sequence_features(a)).float().unsqueeze(0).to(self.device)
        with torch.no_grad():
            probs = torch.softmax(self.model(x), dim=-1)[0].cpu().numpy()
        # serves can only be serves, and vice versa: mask impossible classes
        allowed = np.array([(t.category == "serve") == ctx.is_serve for t in LABELS])
        probs = np.where(allowed, probs, 0.0)
        if probs.sum() == 0:
            return rule_label, rule_conf
        best = int(np.argmax(probs))
        return LABELS[best], float(probs[best] / probs.sum())
