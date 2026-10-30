import numpy as np
import pytest

from synthetic import SR, audio_track
from ttvision.audio.hits import AudioHitDetector
from ttvision.config import PipelineConfig
from ttvision.rally.detector import RallyDetector, RallySignals, visual_hits
from ttvision.types import AudioHit, BallObservation


def rally_hits(serve: float, n: int, iv=(0.42, 0.28)) -> list[float]:
    """Alternating bat->bounce / bounce->bat intervals like a real rally."""
    out, t = [], serve
    for k in range(n):
        out.append(round(t, 3))
        t += iv[k % 2]
    return out


def test_audio_detects_clicks_and_ignores_thumps():
    clicks = rally_hits(2.0, 7) + rally_hits(9.0, 5)
    thumps = [6.0, 6.5, 13.0]          # footsteps / ball on the floor
    x = audio_track(16.0, clicks, thumps)
    hits = AudioHitDetector().detect(x, SR)
    found = np.array([h.time for h in hits])
    assert len(hits) == len(clicks), found
    for c in clicks:
        assert np.min(np.abs(found - c)) < 0.015


def test_audio_short_input():
    assert AudioHitDetector().detect(np.zeros(100, np.float32), SR) == []


def _signals(hit_times, duration=60.0, ball=()):
    return RallySignals(duration=duration,
                        hits=[AudioHit(t, 1.0, 0.5) for t in hit_times],
                        ball=list(ball))


def test_rallies_split_on_dead_time_with_pre_roll():
    a = rally_hits(5.0, 6)
    b = rally_hits(20.0, 9)
    noise = [12.0]                      # isolated click in dead time
    rallies = RallyDetector().segment(_signals(a + noise + b))
    assert len(rallies) == 2
    cfg = PipelineConfig().rally
    for r, hits in zip(rallies, (a, b)):
        assert r.serve_contact_time == pytest.approx(hits[0])
        # no ball track -> default toss duration, then the 1 s pre-roll
        assert r.serve_toss_time == pytest.approx(hits[0] - cfg.default_toss_duration_s)
        assert r.start == pytest.approx(r.serve_toss_time - 1.0)
        assert r.end >= hits[-1]
    assert [r.index for r in rallies] == [0, 1]


def test_pre_serve_bounces_are_trimmed():
    bounces = [3.0, 3.6, 4.2, 4.8]      # server bouncing the ball, steady 0.6 s
    rally = rally_hits(5.6, 6)
    r, = RallyDetector().segment(_signals(bounces + rally))
    assert r.serve_contact_time == pytest.approx(5.6)


def test_dead_ball_dribble_is_trimmed():
    rally = rally_hits(5.0, 6)
    last = rally[-1]
    dribble = [last + 0.6, last + 0.6 + 0.3, last + 0.6 + 0.3 + 0.24, last + 0.6 + 0.3 + 0.24 + 0.19]
    r, = RallyDetector().segment(_signals(rally + dribble))
    assert r.end_reason == "dribble"
    assert r.last_hit_time == pytest.approx(dribble[0])


def test_too_few_hits_is_not_a_rally():
    assert RallyDetector().segment(_signals([5.0, 5.4])) == []


def test_toss_found_from_ball_track():
    contact = 10.0
    ball = []
    # ball rests in the palm, is tossed up ~0.75 s before contact, falls to the bat
    for k in range(60):
        t = 9.0 + k / 60
        if t >= contact:
            break
        if t < 9.25:
            y = 300.0
        else:
            u = (t - 9.25) / (contact - 9.25)
            y = 300.0 - 4 * 80 * u * (1 - u)       # parabola, apex 80 px higher
        ball.append(BallObservation(t, 100.0, y, 4.0, 0.9))
    hits = rally_hits(contact, 5)
    r, = RallyDetector().segment(_signals(hits, ball=ball))
    assert r.serve_toss_time == pytest.approx(9.25, abs=0.04)
    assert r.start == pytest.approx(r.serve_toss_time - 1.0)


def test_visual_hits_from_bounces():
    ball, t = [], 0.0
    # ball bouncing: y goes down then up, three times
    for k in range(90):
        t = k / 30
        y = 200 + 80 * abs(np.sin(np.pi * t / 1.0))
        ball.append(BallObservation(t, 50 + 100 * t, y, 4, 0.9))
    hits = visual_hits(ball)
    assert len(hits) >= 2
