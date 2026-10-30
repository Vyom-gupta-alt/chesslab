import numpy as np
import pytest

from synthetic import swing_sequence
from ttvision.config import PoseConfig
from ttvision.matching.pro_matcher import ProLibrary, ProMatcher, ProStroke, dtw
from ttvision.pose import kinematics as K
from ttvision.pose.analyzer import PoseAnalyzer
from ttvision.strokes.classifier import StrokeContext, rule_based_label, sequence_features
from ttvision.types import StrokeType


def analyze(**kw):
    seq = swing_sequence(**kw)
    out = PoseAnalyzer(PoseConfig(smoothing_window=1)).analyze_sequence(seq)
    assert len(out) == 1
    return out[0]


def test_angle_helpers():
    a, b, c = np.array([1.0, 0, 0]), np.zeros(3), np.array([0, 1.0, 0])
    assert K.angle_at(a, b, c) == pytest.approx(90.0)
    assert K.angle_at(a, b, -a) == pytest.approx(180.0)


def test_phases_and_handedness():
    a = analyze(contact=0.7)
    assert a.handedness == "right"
    assert a.contact_time == pytest.approx(0.7, abs=0.06)
    t = a.times
    p = a.phases
    assert p.prep_start < p.backswing_end < p.contact < p.follow_end
    assert t[p.backswing_end] == pytest.approx(0.5, abs=0.05)
    assert t[p.prep_start] <= 0.3
    kf = a.keyframes()
    assert [k.phase.value for k in kf] == ["preparation", "contact", "follow_through"]


def test_left_handed_player_detected():
    a = analyze(hand="left")
    assert a.handedness == "left"
    # lateral is measured towards the playing arm, so it's still forehand side
    assert a.metrics["contact_lateral_of_com"] > 0


def test_knee_flexion_metric():
    a = analyze(knee_bend_deg=40)
    assert a.metrics["knee_flexion_at_contact"] == pytest.approx(40.0, abs=1.0)


def test_swing_direction_and_classification():
    loop = analyze(up_amp=0.6, forward_amp=1.2)
    assert loop.metrics["swing_angle_at_contact"] > 20
    assert rule_based_label(loop.metrics, StrokeContext())[0] is StrokeType.FOREHAND_TOPSPIN

    push = analyze(up_amp=-0.25, forward_amp=0.5, back_amp=0.15)
    assert push.metrics["swing_angle_at_contact"] < -10
    assert rule_based_label(push.metrics, StrokeContext())[0] is StrokeType.FOREHAND_PUSH
    assert rule_based_label(push.metrics, StrokeContext(is_receive=True))[0] is StrokeType.RECEIVE_PUSH


def test_serve_labels():
    a = analyze(up_amp=0.1, forward_amp=0.6)
    label, _ = rule_based_label(a.metrics, StrokeContext(is_serve=True))
    assert label.category == "serve"


def test_contact_hint_snaps_to_audio():
    seq = swing_sequence(contact=0.7)
    out = PoseAnalyzer(PoseConfig(smoothing_window=1)).analyze_sequence(seq, contact_hints=[0.71])
    assert len(out) == 1 and out[0].contact_time == pytest.approx(0.7, abs=0.06)


def test_sequence_features_shape():
    a = analyze()
    f = sequence_features(a)
    assert f.shape[0] == 48 and np.isfinite(f).all()


def test_dtw_identity_and_warp():
    x = np.sin(np.linspace(0, 3, 40))[:, None] + 2
    cost = np.abs(x - x.T)
    c, path = dtw(cost)
    assert c == pytest.approx(0.0)
    assert path[0] == (0, 0) and path[-1] == (39, 39)


def _pro(a, id="p1", stroke="forehand_topspin"):
    return ProStroke(id=id, player="Ref", stroke_type=stroke, context="vs_backspin", analysis=a)


def test_pro_matcher_ranks_similar_stroke_first():
    user = analyze(knee_bend_deg=15)
    pro_loop = analyze(knee_bend_deg=40, backswing_start=0.1)        # same stroke, slower prep
    pro_push = analyze(up_amp=-0.3, forward_amp=0.5, back_amp=0.15)
    matcher = ProMatcher(ProLibrary([_pro(pro_loop, "loop"), _pro(pro_push, "push")]))

    res = matcher.match(user, stroke_type="forehand_topspin")
    assert [r.pro.id for r in res] == ["loop", "push"]
    assert res[0].similarity > 0.9
    assert res[0].similarity > res[1].similarity

    d = res[0].metric_diffs["knee_flexion_at_backswing"]
    assert d["delta"] == pytest.approx(-25.0, abs=1.5)
    assert any("Bend your knees" in c for c in res[0].cues)


def test_pro_library_roundtrip(tmp_path):
    seq = swing_sequence()
    ProLibrary.save(tmp_path / "a.json", seq, id="a", player="Ref", stroke_type="forehand_topspin",
                    context="vs_backspin", handedness="right")
    lib = ProLibrary.load(tmp_path, PoseAnalyzer(PoseConfig(smoothing_window=1)))
    assert len(lib.strokes) == 1
    assert lib.filter("forehand_topspin", "vs_backspin")
    assert not lib.filter("chop")
    m = ProMatcher(lib).compare(analyze(), lib.strokes[0])
    assert m.similarity == pytest.approx(1.0, abs=1e-3)
