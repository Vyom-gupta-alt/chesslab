"""Ball-contact sound detection.

A ball hitting a bat or the table makes a sharp click whose energy sits mostly
in the 2.5-4 kHz band. Voices, footsteps and shoe squeaks are lower or broader.
We therefore track:

1. the log energy in the ball band, frame by frame (short-time Fourier transform),
2. its rise from the previous frames (an "onset" curve),
3. an adaptive threshold (rolling median + k * MAD) so crowd noise and
   different gain levels don't need hand tuning,
4. the share of the frame's energy that is in the band, to reject loud
   low-frequency sounds that leak into it.

Everything is computed in chunks so an hour of audio stays well under 100 MB.
"""

from __future__ import annotations

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from ..config import AudioConfig
from ..types import AudioHit

_EPS = 1e-10
_CHUNK_FRAMES = 20000


class AudioHitDetector:
    def __init__(self, config: AudioConfig | None = None):
        self.cfg = config or AudioConfig()

    # -- public API ---------------------------------------------------------
    def detect(self, samples: np.ndarray, sample_rate: int | None = None) -> list[AudioHit]:
        sr = sample_rate or self.cfg.sample_rate
        if samples.ndim > 1:
            samples = samples.mean(axis=1)
        samples = samples.astype(np.float32, copy=False)
        if samples.size < self.cfg.n_fft:
            return []

        band, total = self.band_energy(samples, sr)
        onset = self.onset_curve(band)
        threshold = self.adaptive_threshold(onset, sr)
        ratio = band / (total + _EPS)
        # how far each frame's band level sits above the local background (dB)
        log_e = np.log(band + _EPS)
        level_db = (log_e - self._rolling_median(log_e, sr, self.cfg.background_window_s)) * (10 / np.log(10))
        return self._pick_peaks(onset, threshold, ratio, level_db, sr)

    def frame_times(self, n_frames: int, sample_rate: int) -> np.ndarray:
        # time of the centre of each analysis window
        return (np.arange(n_frames) * self.cfg.hop_length + self.cfg.n_fft / 2) / sample_rate

    # -- stages (public so they can be unit tested / visualised) -------------
    def band_energy(self, samples: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
        n_fft, hop = self.cfg.n_fft, self.cfg.hop_length
        n_frames = 1 + (samples.size - n_fft) // hop
        window = np.hanning(n_fft).astype(np.float32)
        freqs = np.fft.rfftfreq(n_fft, d=1.0 / sr)
        in_band = (freqs >= self.cfg.band_low_hz) & (freqs <= self.cfg.band_high_hz)
        if not in_band.any():
            raise ValueError("Ball band is outside the audio's frequency range")

        frames = sliding_window_view(samples, n_fft)[::hop]
        band = np.empty(n_frames, dtype=np.float64)
        total = np.empty(n_frames, dtype=np.float64)
        for start in range(0, n_frames, _CHUNK_FRAMES):
            chunk = frames[start:start + _CHUNK_FRAMES] * window
            power = np.abs(np.fft.rfft(chunk, axis=1)) ** 2
            band[start:start + len(chunk)] = power[:, in_band].sum(axis=1)
            total[start:start + len(chunk)] = power[:, 1:].sum(axis=1)  # ignore DC
        return band, total

    @staticmethod
    def onset_curve(band: np.ndarray) -> np.ndarray:
        """Rise of log band energy over the louder of the previous two frames."""
        log_e = np.log(band + _EPS)
        prev = np.maximum(np.roll(log_e, 1), np.roll(log_e, 2))
        prev[:2] = log_e[:2]
        return np.maximum(log_e - prev, 0.0)

    def _rolling_median(self, x: np.ndarray, sr: int, window_s: float,
                        with_mad: bool = False):
        frames_per_s = sr / self.cfg.hop_length
        win = max(3, int(window_s * frames_per_s) | 1)  # odd
        half = win // 2
        padded = np.pad(x, half, mode="reflect" if x.size > half else "edge")
        med = np.empty_like(x)
        mad = np.empty_like(x) if with_mad else None
        for start in range(0, x.size, _CHUNK_FRAMES):
            stop = min(start + _CHUNK_FRAMES, x.size)
            view = sliding_window_view(padded[start:stop + 2 * half], win)
            m = np.median(view, axis=1)
            med[start:stop] = m
            if mad is not None:
                mad[start:stop] = np.median(np.abs(view - m[:, None]), axis=1)
        return (med, mad) if with_mad else med

    def adaptive_threshold(self, onset: np.ndarray, sr: int) -> np.ndarray:
        med, mad = self._rolling_median(onset, sr, self.cfg.threshold_window_s, with_mad=True)
        # the floor (a ~4 dB jump) stops background noise from triggering
        return med + self.cfg.threshold_k * np.maximum(mad, 0.05) + self.cfg.min_onset_rise

    def _pick_peaks(self, onset, threshold, ratio, level_db, sr) -> list[AudioHit]:
        frames_per_s = sr / self.cfg.hop_length
        min_gap = max(1, int(self.cfg.min_hit_interval_s * frames_per_s))
        candidates = np.flatnonzero(onset > threshold)
        if candidates.size == 0:
            return []

        # local maximum within +-1 frame
        left = np.r_[-np.inf, onset[:-1]][candidates]
        right = np.r_[onset[1:], -np.inf][candidates]
        candidates = candidates[(onset[candidates] >= left) & (onset[candidates] >= right)]

        times = self.frame_times(onset.size, sr)
        hits: list[AudioHit] = []
        last_idx = -10 * min_gap
        for idx in candidates:
            # the band ratio is most reliable on the loud frame just after the rise
            r = float(ratio[idx:idx + 3].max())
            if r < self.cfg.min_band_ratio:
                continue
            if float(level_db[idx:idx + 3].max()) < self.cfg.min_level_above_background_db:
                continue
            strength = float(onset[idx] - threshold[idx])
            if idx - last_idx < min_gap:
                if hits and strength > hits[-1].strength:  # keep the stronger one
                    hits[-1] = AudioHit(float(times[idx]), strength, r)
                    last_idx = idx
                continue
            hits.append(AudioHit(float(times[idx]), strength, r))
            last_idx = idx
        return hits
