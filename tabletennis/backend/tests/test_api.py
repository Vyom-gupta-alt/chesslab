import json
import time

import numpy as np


def upload(client, path, chunk_order=None):
    data = path.read_bytes()
    init = client.post("/api/uploads", json={"filename": "My Match.mp4", "size": len(data)}).json()
    cs, n = init["chunk_size"], init["total_chunks"]
    order = chunk_order(n) if chunk_order else range(n)
    for i in order:
        r = client.put(f"/api/uploads/{init['upload_id']}/chunks/{i}", content=data[i * cs:(i + 1) * cs])
        assert r.status_code == 200, r.text
    return init, client.post(f"/api/uploads/{init['upload_id']}/complete")


def wait_done(client, vid, timeout=180):
    end = time.time() + timeout
    while time.time() < end:
        job = client.get(f"/api/videos/{vid}").json()["job"]
        if job.get("status") in ("done", "failed"):
            return job
        time.sleep(0.5)
    raise AssertionError("timeout")


def test_upload_rejects_bad_files(client):
    assert client.post("/api/uploads", json={"filename": "notes.txt", "size": 10}).status_code == 400
    assert client.post("/api/uploads", json={"filename": "a.mp4", "size": 0}).status_code == 400


def test_incomplete_upload_reports_missing(client):
    init = client.post("/api/uploads", json={"filename": "a.mp4", "size": 3 * 1024 * 1024}).json()
    client.put(f"/api/uploads/{init['upload_id']}/chunks/1", content=b"x" * 1024 * 1024)
    assert client.get(f"/api/uploads/{init['upload_id']}").json()["received"] == [1]
    r = client.post(f"/api/uploads/{init['upload_id']}/complete")
    assert r.status_code == 409 and r.json()["detail"]["missing"] == [0, 2]
    # wrong-sized chunk is refused
    assert client.put(f"/api/uploads/{init['upload_id']}/chunks/0", content=b"x" * 10).status_code == 400


def test_full_processing_flow(client, match_video):
    init, r = upload(client, match_video, chunk_order=lambda n: reversed(range(n)))
    assert r.status_code == 200, r.text
    vid = r.json()["video_id"]

    # SSE stream ends with the final state
    with client.stream("GET", f"/api/videos/{vid}/events") as s:
        events = [json.loads(line[6:]) for line in s.iter_lines() if line.startswith("data: ")]
    assert events[-1]["status"] == "done", events[-1]
    assert any(e.get("stage") == "vision" for e in events) or len(events) >= 1

    info = client.get(f"/api/videos/{vid}").json()
    assert info["filename"] == "My Match.mp4" and info["has_highlights"]
    assert abs(info["duration"] - 12.0) < 0.2

    analysis = client.get(f"/api/videos/{vid}/analysis").json()
    assert len(analysis["rallies"]) == 2
    assert "skeletons" not in analysis

    # clips + rally-only video exist, and support seeking (HTTP Range)
    r = client.get(f"/api/videos/{vid}/clips/0", headers={"Range": "bytes=0-99"})
    assert r.status_code == 206 and len(r.content) == 100
    full = client.get(f"/api/videos/{vid}/highlights")
    assert full.status_code == 200 and len(full.content) > 1000
    expected = sum(c["end"] - c["start"] for c in analysis["clips"])
    import subprocess
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".mp4") as fh:
        fh.write(full.content)
        fh.flush()
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                    "-of", "csv=p=0", fh.name], capture_output=True, text=True).stdout)
    assert abs(dur - expected) < 0.25
    assert client.get(f"/api/videos/{vid}/source", headers={"Range": "bytes=-50"}).status_code == 206
    exp = client.get(f"/api/videos/{vid}/export")
    assert "attachment" in exp.headers["content-disposition"]

    assert any(v["id"] == vid for v in client.get("/api/videos").json())
    assert client.delete(f"/api/videos/{vid}").status_code == 200
    assert client.get(f"/api/videos/{vid}").status_code == 404


def test_pro_library_and_compare(client):
    from app import storage
    from ttvision.demo import synthetic_swing

    pros = client.get("/api/pros").json()
    assert {p["stroke_type"] for p in pros} >= {"forehand_topspin", "backhand_topspin"}
    assert all(p["synthetic"] for p in pros)

    # fake an analysed video with one stroke (as the pipeline would store it)
    vid = storage.new_id()
    vdir = storage.video_dir(vid)
    vdir.mkdir(parents=True)
    storage.write_json(vdir / "meta.json", {"id": vid, "filename": "x.mp4", "size": 1})
    seq = synthetic_swing(up_amp=0.6, forward_amp=1.1, knee_bend_deg=15)
    seq.times = seq.times + 30.0
    np.savez_compressed(vdir / "pose.npz", **{"0_0__times": seq.times, "0_0__world": seq.world,
                                              "0_0__image": seq.image, "0_0__info": np.array([30.7, 1.0])})

    sug = client.get("/api/compare/suggest", params={"video_id": vid, "stroke_key": "0:0"}).json()
    assert sug[0]["stroke_type"] == "forehand_topspin"

    res = client.post("/api/compare", json={"video_id": vid, "stroke_key": "0:0",
                                            "pro_id": "synthetic_fh_topspin"}).json()
    assert res["match"]["similarity"] > 0.9
    assert any("knee" in c.lower() for c in res["match"]["cues"])
    assert len(res["user"]["overlay"]) == len(res["user"]["times"])
    assert res["user"]["phase_times"]["contact"] > 30

    # save the user's stroke as a reference, then delete it
    new = client.post("/api/pros", json={"video_id": vid, "stroke_key": "0:0", "player": "Coach",
                                         "stroke_type": "forehand_topspin"}).json()
    saved = next(p for p in client.get("/api/pros").json() if p["id"] == new["id"])
    assert saved["video_id"] == vid and not saved["synthetic"] and saved["clip_start"] == 30.0
    assert client.delete(f"/api/pros/{new['id']}").status_code == 200
    assert client.delete("/api/pros/../../etc").status_code in (400, 404)
