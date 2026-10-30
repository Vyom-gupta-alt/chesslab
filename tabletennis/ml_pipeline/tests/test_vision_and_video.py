"""Table detection on a drawn frame, and an end-to-end run on a rendered video."""

import shutil
import subprocess
import wave

import numpy as np
import pytest

cv2 = pytest.importorskip("cv2")

from synthetic import SR, audio_track  # noqa: E402
from ttvision.vision.table import TableDetector, to_table_coords  # noqa: E402

CORNERS = np.array([[150, 120], [490, 120], [590, 330], [50, 330]], np.float32)  # end-on view


def table_frame(w=640, h=360, seed=0):
    rng = np.random.default_rng(seed)
    img = np.full((h, w, 3), (60, 70, 80), np.uint8)
    img = cv2.add(img, rng.integers(0, 12, img.shape, dtype=np.uint8))
    cv2.fillConvexPoly(img, CORNERS.astype(np.int32), (140, 70, 20))       # blue (BGR)
    cv2.polylines(img, [CORNERS.astype(np.int32)], True, (255, 255, 255), 2)
    cv2.line(img, (100, 225), (540, 225), (230, 230, 230), 3)               # net
    return img


def test_table_corners_and_homography():
    geo = TableDetector().detect([table_frame(seed=s) for s in range(3)])
    assert geo is not None
    assert np.abs(geo.corners - CORNERS).max() < 6
    # end-on camera: far edge (top) is x = 0, near edge (bottom) is x = 274
    x0, _ = to_table_coords(geo.homography, CORNERS[:2].mean(axis=0))
    x1, _ = to_table_coords(geo.homography, CORNERS[2:].mean(axis=0))
    assert x0 == pytest.approx(0, abs=6) and x1 == pytest.approx(274, abs=6)


def test_manual_corners_override():
    geo = TableDetector().detect([np.zeros((360, 640, 3), np.uint8)], manual_corners=CORNERS.tolist())
    assert geo is not None and np.allclose(geo.corners, CORNERS)


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
def test_end_to_end_rally_detection(tmp_path):
    from ttvision.config import PipelineConfig
    from ttvision.rally.detector import RallyDetector

    fps, dur = 30, 24.0
    serves = [4.0, 15.0]
    clicks = []
    for s in serves:
        t = s
        for k in range(7):
            clicks.append(t)
            t += (0.42, 0.28)[k % 2]

    # video: table + a ball that flies over it only during the rallies
    vpath = tmp_path / "v.avi"
    vw = cv2.VideoWriter(str(vpath), cv2.VideoWriter_fourcc(*"MJPG"), fps, (640, 360))
    for i in range(int(dur * fps)):
        t = i / fps
        img = table_frame(seed=i % 5)
        for s in serves:
            if s - 0.6 <= t <= s + 2.6:
                u = (t - s) / 0.7
                x = 320 + 200 * np.sin(np.pi * u)
                y = 225 + 80 * np.cos(np.pi * u) - 30 * abs(np.sin(2 * np.pi * u))
                cv2.circle(img, (int(x), int(y)), 5, (255, 255, 255), -1)
        vw.write(img)
    vw.release()

    apath = tmp_path / "a.wav"
    pcm = (np.clip(audio_track(dur, clicks), -1, 1) * 32767).astype(np.int16)
    with wave.open(str(apath), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())

    out = tmp_path / "match.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(vpath), "-i", str(apath),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(out)],
                   check=True)

    rallies = RallyDetector(PipelineConfig()).detect(out)
    assert len(rallies) == 2
    for r, s in zip(rallies, serves):
        assert r.serve_contact_time == pytest.approx(s, abs=0.03)
        assert r.start < r.serve_toss_time < r.serve_contact_time
        assert r.serve_toss_time - r.start == pytest.approx(1.0, abs=1e-6)
        assert r.end > r.last_hit_time

    import json

    from ttvision.pipeline import analyze_match

    result = json.loads(json.dumps(analyze_match(out, with_pose=False)))
    assert result["summary"]["rally_count"] == 2
    assert [c["index"] for c in result["clips"]] == [0, 1]


def test_camera_view_guess():
    from ttvision.vision.table import camera_view

    assert camera_view(CORNERS) == "end"
    side_on = np.array([[80, 150], [560, 150], [600, 220], [40, 220]], np.float32)
    assert camera_view(side_on) == "side"
