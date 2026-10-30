"""3D kinematics from MediaPipe world landmarks.

World landmarks are in metres with the origin at the hip centre, y pointing
down. All functions are vectorised over time: inputs are (T, 33, 3).

Because the origin moves with the hips, velocities here are *relative to the
hips* (arm + trunk action), which is what stroke technique cares about;
footwork is measured separately from 2D image landmarks.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# MediaPipe Pose (BlazePose) 33-landmark topology
NOSE = 0
L_SHOULDER, R_SHOULDER = 11, 12
L_ELBOW, R_ELBOW = 13, 14
L_WRIST, R_WRIST = 15, 16
L_INDEX, R_INDEX = 19, 20
L_HIP, R_HIP = 23, 24
L_KNEE, R_KNEE = 25, 26
L_ANKLE, R_ANKLE = 27, 28

SKELETON_EDGES = [
    (11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (15, 19), (16, 20),
    (11, 23), (12, 24), (23, 24), (23, 25), (25, 27), (24, 26), (26, 28),
    (27, 31), (28, 32), (27, 29), (28, 30), (0, 11), (0, 12),
]

UP = np.array([0.0, -1.0, 0.0])

# Approximate segment mass fractions (Dempster/Winter), summing to 1.0
_SEGMENTS = [
    ((NOSE, NOSE), 0.081),                         # head + neck
    ((L_SHOULDER, R_SHOULDER, L_HIP, R_HIP), 0.497),  # trunk
    ((L_SHOULDER, L_ELBOW), 0.028), ((R_SHOULDER, R_ELBOW), 0.028),
    ((L_ELBOW, L_WRIST), 0.022), ((R_ELBOW, R_WRIST), 0.022),
    ((L_HIP, L_KNEE), 0.100), ((R_HIP, R_KNEE), 0.100),
    ((L_KNEE, L_ANKLE), 0.061), ((R_KNEE, R_ANKLE), 0.061),
]


@dataclass(frozen=True)
class Arm:
    shoulder: int
    elbow: int
    wrist: int
    index: int
    hip: int
    side: str

    @staticmethod
    def for_hand(hand: str) -> "Arm":
        if hand == "left":
            return Arm(L_SHOULDER, L_ELBOW, L_WRIST, L_INDEX, L_HIP, "left")
        return Arm(R_SHOULDER, R_ELBOW, R_WRIST, R_INDEX, R_HIP, "right")


def _unit(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-9)


def angle_at(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> np.ndarray:
    """Interior angle ABC in degrees, for (..., 3) arrays."""
    ba, bc = _unit(a - b), _unit(c - b)
    return np.degrees(np.arccos(np.clip((ba * bc).sum(-1), -1.0, 1.0)))


def yaw_deg(left: np.ndarray, right: np.ndarray) -> np.ndarray:
    """Heading of the left->right line in the horizontal (x, z) plane, unwrapped."""
    v = right - left
    return np.degrees(np.unwrap(np.arctan2(v[..., 2], v[..., 0])))


def centre_of_mass(world: np.ndarray) -> np.ndarray:
    com = np.zeros(world.shape[:-2] + (3,))
    for idx, w in _SEGMENTS:
        com += w * world[..., list(idx), :].mean(axis=-2)
    return com


def body_frame(world: np.ndarray, arm: Arm) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Per-frame (forward, lateral, up) unit axes.

    lateral points from the body centre towards the playing-arm side, so a
    positive lateral contact means "forehand side" for either handedness.
    """
    other_hip = L_HIP if arm.hip == R_HIP else R_HIP
    lateral = world[:, arm.hip] - world[:, other_hip]
    lateral[:, 1] = 0.0
    lateral = _unit(lateral)
    up = np.broadcast_to(UP, lateral.shape)
    forward = _unit(np.cross(up, lateral))
    # choose the forward sign so the nose is in front of the shoulders on average
    mid_sh = world[:, [L_SHOULDER, R_SHOULDER]].mean(axis=1)
    facing = ((world[:, NOSE] - mid_sh) * forward).sum(-1)
    if np.nanmean(facing) < 0:
        forward = -forward
    return forward, lateral, np.array(up)


def racket_position(world: np.ndarray, arm: Arm, extension: float) -> np.ndarray:
    """Estimate the racket centre: extend the forearm through the hand."""
    forearm = _unit(world[:, arm.wrist] - world[:, arm.elbow])
    hand = _unit(world[:, arm.index] - world[:, arm.wrist])
    direction = _unit(0.5 * forearm + 0.5 * hand)
    return world[:, arm.wrist] + extension * direction


def velocity(x: np.ndarray, times: np.ndarray) -> np.ndarray:
    if len(times) < 2:
        return np.zeros_like(x)
    return np.gradient(x, times, axis=0)


def smooth(x: np.ndarray, window: int) -> np.ndarray:
    """Centered moving average along time with edge padding."""
    if window <= 1 or len(x) < 3:
        return x
    window = min(window, len(x) if len(x) % 2 else len(x) - 1)
    if window <= 1:
        return x
    k = np.ones(window) / window
    pad = window // 2
    xp = np.pad(x, [(pad, pad)] + [(0, 0)] * (x.ndim - 1), mode="edge")
    flat = xp.reshape(len(xp), -1)
    out = np.stack([np.convolve(flat[:, j], k, mode="valid") for j in range(flat.shape[1])], axis=1)
    return out.reshape(x.shape)


def fill_gaps(x: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """Linear interpolation over frames where the pose was missing."""
    if valid.all() or not valid.any():
        return x
    t = np.arange(len(x))
    flat = x.reshape(len(x), -1).copy()
    for j in range(flat.shape[1]):
        flat[~valid, j] = np.interp(t[~valid], t[valid], flat[valid, j])
    return flat.reshape(x.shape)


def joint_angles(world: np.ndarray, arm: Arm) -> dict[str, np.ndarray]:
    """Time series of the angles a coach looks at."""
    other = Arm.for_hand("left" if arm.side == "right" else "right")
    knee_l = angle_at(world[:, L_HIP], world[:, L_KNEE], world[:, L_ANKLE])
    knee_r = angle_at(world[:, R_HIP], world[:, R_KNEE], world[:, R_ANKLE])
    hip_yaw = yaw_deg(world[:, L_HIP], world[:, R_HIP])
    sh_yaw = yaw_deg(world[:, L_SHOULDER], world[:, R_SHOULDER])
    mid_hip = world[:, [L_HIP, R_HIP]].mean(axis=1)
    mid_sh = world[:, [L_SHOULDER, R_SHOULDER]].mean(axis=1)
    spine = _unit(mid_sh - mid_hip)
    return {
        "elbow": angle_at(world[:, arm.shoulder], world[:, arm.elbow], world[:, arm.wrist]),
        "shoulder_abduction": angle_at(world[:, arm.hip], world[:, arm.shoulder], world[:, arm.elbow]),
        "wrist": angle_at(world[:, arm.elbow], world[:, arm.wrist], world[:, arm.index]),
        "free_elbow": angle_at(world[:, other.shoulder], world[:, other.elbow], world[:, other.wrist]),
        "knee_left": knee_l,
        "knee_right": knee_r,
        "knee_flexion": 180.0 - (knee_l + knee_r) / 2.0,   # 0 = straight legs
        "hip_rotation": hip_yaw - hip_yaw[0],
        "shoulder_rotation": sh_yaw - sh_yaw[0],
        "x_factor": sh_yaw - hip_yaw,                        # trunk twist (shoulders vs hips)
        "trunk_lean": np.degrees(np.arccos(np.clip((spine * UP).sum(-1), -1, 1))),
    }
