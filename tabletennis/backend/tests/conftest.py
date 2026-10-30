import subprocess
import wave

import numpy as np
import pytest


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TT_STORAGE_DIR", str(tmp_path / "storage"))
    monkeypatch.setenv("TT_UPLOAD_CHUNK_SIZE_MB", "1")
    monkeypatch.setenv("TT_STATIC_DIR", str(tmp_path / "nostatic"))
    from app.core.config import get_settings

    get_settings.cache_clear()
    import importlib

    import app.main as main

    importlib.reload(main)
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        yield c
    get_settings.cache_clear()


def _click(sr, amp=0.6):
    t = np.arange(int(sr * 0.012)) / sr
    return (amp * np.sin(2 * np.pi * 3200 * t) * np.exp(-t / 0.003)).astype(np.float32)


@pytest.fixture(scope="session")
def match_video(tmp_path_factory):
    """12 s video: blue table, ball flying during two rallies, clicks on the audio."""
    import cv2

    d = tmp_path_factory.mktemp("video")
    fps, dur, sr = 30, 12.0, 22050
    serves = [2.5, 8.0]
    corners = np.array([[150, 120], [490, 120], [590, 330], [50, 330]], np.int32)
    vw = cv2.VideoWriter(str(d / "v.avi"), cv2.VideoWriter_fourcc(*"MJPG"), fps, (640, 360))
    for i in range(int(dur * fps)):
        t = i / fps
        img = np.full((360, 640, 3), (60, 70, 80), np.uint8)
        cv2.fillConvexPoly(img, corners, (140, 70, 20))
        for s in serves:
            if s - 0.6 <= t <= s + 2.4:
                u = (t - s) / 0.7
                cv2.circle(img, (int(320 + 200 * np.sin(np.pi * u)), int(225 + 80 * np.cos(np.pi * u))),
                           5, (255, 255, 255), -1)
        vw.write(img)
    vw.release()
    audio = 0.01 * np.random.default_rng(0).standard_normal(int(dur * sr)).astype(np.float32)
    for s in serves:
        t = s
        for k in range(7):
            i = int(t * sr)
            c = _click(sr)
            audio[i:i + c.size] += c
            t += (0.42, 0.28)[k % 2]
    with wave.open(str(d / "a.wav"), "wb") as wf:
        wf.setnchannels(1), wf.setsampwidth(2), wf.setframerate(sr)
        wf.writeframes((np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes())
    out = d / "match.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(d / "v.avi"), "-i", str(d / "a.wav"),
                    "-c:v", "libx264", "-g", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(out)],
                   check=True)
    return out
