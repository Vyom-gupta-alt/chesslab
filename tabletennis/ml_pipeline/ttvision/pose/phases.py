"""Split a stroke into preparation/backswing, contact and follow-through.

All three phases are found from the racket-speed curve (racket = forearm
extended through the hand, relative to the hips):

* **contact**: the speed peak (snapped to the audio click when we have one,
  then refined to the fastest frame within +-80 ms);
* **end of backswing**: the last speed minimum before contact, i.e. where
  the racket stops going back and turns forward;
* **start of preparation**: the last rest frame before the backswing movement;
* **end of follow-through**: when speed falls below 25 % of the peak.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class PhaseIndices:
    prep_start: int
    backswing_end: int
    contact: int
    follow_end: int

    def as_dict(self) -> dict[str, int]:
        return {"prep_start": self.prep_start, "backswing_end": self.backswing_end,
                "contact": self.contact, "follow_end": self.follow_end}


def _idx_at(times: np.ndarray, t: float) -> int:
    return int(np.clip(np.searchsorted(times, t), 0, len(times) - 1))


def segment_phases(times: np.ndarray, speed: np.ndarray,
                   contact_hint: float | None = None) -> PhaseIndices:
    n = len(times)
    if n < 3:
        raise ValueError("Need at least 3 frames to segment a stroke")

    if contact_hint is not None:
        c0 = _idx_at(times, contact_hint)
        lo, hi = _idx_at(times, times[c0] - 0.08), _idx_at(times, times[c0] + 0.08)
        contact = lo + int(np.argmax(speed[lo:hi + 1]))
    else:
        contact = int(np.argmax(speed))
    peak = max(float(speed[contact]), 1e-6)

    # backswing end: walking back from contact, the first speed minimum (where the
    # racket turned from going back to going forward). Small bumps while the racket
    # is still fast are ignored.
    lo = _idx_at(times, times[contact] - 0.6)
    k = contact
    while k > lo and not (speed[k - 1] >= speed[k] and speed[k] < 0.5 * peak):
        k -= 1
    backswing_end = min(k, max(contact - 1, 0))

    # preparation start: rest point before the backswing movement
    pre_lo = _idx_at(times, times[backswing_end] - 0.8)
    prep_start = pre_lo
    if backswing_end > pre_lo:
        seg = speed[pre_lo:backswing_end]
        bs_peak_rel = int(np.argmax(seg))
        bs_peak = float(seg[bs_peak_rel])
        rest = np.flatnonzero(seg[:bs_peak_rel] < 0.3 * bs_peak)
        prep_start = pre_lo + int(rest[-1]) if rest.size else pre_lo

    # follow-through end
    after = np.flatnonzero(speed[contact + 1:] < 0.25 * peak)
    follow_end = contact + 1 + int(after[0]) if after.size else n - 1
    follow_end = min(follow_end, _idx_at(times, times[contact] + 0.6))

    return PhaseIndices(prep_start, backswing_end, contact, max(follow_end, contact))


def find_stroke_peaks(times: np.ndarray, speed: np.ndarray, min_speed: float,
                      min_separation_s: float = 0.35) -> list[int]:
    """Local maxima of racket speed that look like strokes."""
    if len(speed) < 3:
        return []
    is_peak = (speed[1:-1] >= speed[:-2]) & (speed[1:-1] > speed[2:]) & (speed[1:-1] >= min_speed)
    peaks = list(np.flatnonzero(is_peak) + 1)
    peaks.sort(key=lambda i: speed[i], reverse=True)
    chosen: list[int] = []
    for p in peaks:
        if all(abs(times[p] - times[q]) >= min_separation_s for q in chosen):
            chosen.append(int(p))
    return sorted(chosen)
