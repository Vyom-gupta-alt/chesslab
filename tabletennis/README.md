# TT Analyzer

Automatic table tennis match editing, stroke tagging and pro technique comparison.

```
tabletennis/
├── ml_pipeline/          Phase 1 – computer vision + audio engine (Python package `ttvision`)  ✅
│   ├── ttvision/
│   │   ├── audio/hits.py          ball-contact click detector (2.5–4 kHz band)
│   │   ├── vision/table.py        table corners + homography to court coordinates (cm)
│   │   ├── vision/ball.py         ball detection (motion / YOLO) + trajectory tracker
│   │   ├── vision/motion.py       player activity on each side of the net
│   │   ├── rally/detector.py      RallyDetector: audio-visual fusion → rally clips
│   │   ├── pose/estimator.py      MediaPipe PoseLandmarker wrapper (33 joints, 2D + 3D)
│   │   ├── pose/kinematics.py     joint angles, hip/shoulder rotation, centre of mass
│   │   ├── pose/phases.py         preparation / contact / follow-through segmentation
│   │   ├── pose/analyzer.py       PoseAnalyzer: per-stroke breakdown + metrics
│   │   ├── strokes/classifier.py  StrokeClassifier: rules + optional PyTorch GRU
│   │   ├── matching/pro_matcher.py ProMatcher: cosine similarity + DTW vs pro library
│   │   ├── pipeline.py            end-to-end analysis → JSON
│   │   └── cli.py                 `ttvision analyze | rallies | add-pro`
│   ├── configs/default.yaml
│   └── tests/                     synthetic audio, skeletons, rendered video
├── backend/              Phase 2 – FastAPI + Celery + Redis + FFmpeg  (config + stub)
├── frontend/             Phase 3 – Next.js 14 + Tailwind + shadcn/ui    (config + stub)
├── docker-compose.yml
└── .env.example
```

## Quick start (ML pipeline)

Needs Python 3.10+ and FFmpeg on `PATH`. MediaPipe also needs `libegl1` and `libgles2` on Linux.

```bash
cd tabletennis/ml_pipeline
pip install -e ".[pose,dev]"
pytest
```

```bash
ttvision rallies match.mp4
```

```bash
ttvision analyze match.mp4 -o result.json --config configs/default.yaml
```

The first pose run downloads the official MediaPipe pose model (~30 MB) to `~/.cache/ttvision`.

## How it works

### Rally clipping (`RallyDetector`)

1. **Audio.** The ball hitting a bat or the table is a short click, with most of its energy at
   2.5–4 kHz. The detector tracks that band's energy frame by frame (5.8 ms hops). It keeps
   sharp rises that clear an adaptive threshold (rolling median + k·MAD), stand at least 9 dB
   above the room's background level, and carry enough of their energy in the band. Voices,
   footsteps and a ball bouncing on the floor are rejected.
2. **Vision.** The table is found by colour segmentation and edge-line fitting. Its corners are
   voted over 15 frames, and a homography maps pixels to table centimetres (net at x = 137).
   Whether the camera is behind a player or level with the net is guessed from perspective.
   The ball is tracked with three-frame differencing (or YOLO weights) plus a
   constant-velocity gate. Player motion is measured on each side of the net.
3. **Fusion.**
   - Hits are grouped into rallies. A gap of more than 1.6 s ends a rally.
   - The server's pre-serve bounces are dropped: the serve is the first hit after which the
     ball crosses the net. If the ball can't be seen, a steady bounce rhythm marks them instead.
   - The decaying bounce train of a dead ball is trimmed off the end.
   - The **serve toss** is found on the ball track: the last moment the ball sits still in the
     palm before rising to its apex.
   - The point ends when the ball leaves the table area, stops being seen, or the audio stops.
   - Each candidate gets a confidence score from the hit count, rhythm, audio band share,
     ball visibility and player motion.
4. **Clip window.** Each clip runs from **toss − 1.0 s** to **point end + 0.6 s**. Overlapping
   clips are trimmed so the continuous video has no repeated frames. Muted footage works too:
   sharp turns in the ball's trajectory stand in for the clicks.

### Pose and stroke breakdown (`PoseAnalyzer`)

- MediaPipe PoseLandmarker runs in video mode with two people per frame. It keeps following the
  chosen player (the near one by default).
- From the 3D world landmarks it computes:
  - elbow, shoulder and wrist angles
  - knee bend
  - hip and shoulder rotation, and trunk twist (the "X-factor")
  - trunk lean
  - a segment-weighted centre of mass
  - the racket position, estimated by extending the forearm through the hand
- **Phases** come from the racket speed curve:
  - contact = the speed peak, snapped to the audio click when there is one
  - end of backswing = the last speed minimum before contact
  - start of preparation = the last rest frame before that
  - end of follow-through = when speed falls below 25 % of the peak
- Only speed peaks where the racket moves forward count as strokes, so backswings are ignored.
- **Metrics per stroke:**
  - angles at each keyframe
  - contact point relative to the centre of mass (forward / towards the playing-arm side / up),
    which works for both right- and left-handers
  - swing path angle at contact
  - racket speed, rotation ranges and phase durations
- **Measurement caveat:** speeds are relative to the hips, so they show arm and trunk action,
  not footwork.

### Stroke classification (`StrokeClassifier`)

- The rule-based labels use:
  - which side of the body contact happens on (forehand or backhand)
  - the racket path angle, racket speed, contact height and elbow height
  - rally context: serve, receive or rally stroke
- These rules give the serve, receive and stroke labels from the spec without any training data.
- The thresholds are starting points and need calibrating on labelled footage.
- `TemporalStrokeNet` is a Conv1D + bidirectional GRU over per-frame pose features. Once
  labelled clips exist, train it and pass the checkpoint as `model_path`.

### Pro comparison (`ProMatcher`)

- Both strokes become per-frame feature sequences:
  - joint positions, scaled by torso length and expressed in the player's own body frame
  - key joint angles
  - the racket path
- Left-handers are mirrored automatically through the body frame.
- Each sequence is resampled phase by phase so the contact moments line up.
- DTW with a Sakoe–Chiba band and cosine distance aligns the two sequences. The similarity score
  is the mean cosine similarity along the aligned path.
- Metric differences become ranked coaching cues, for example
  "Bend your knees more as you load (knee bend at backswing: 15.0° vs pro 40.0°)".
- Build the pro library with `ttvision add-pro` (format in `ml_pipeline/data/pro_library/README.md`).

## Output JSON (consumed by backend and frontend)

`analyze_match()` returns:

- `rallies`: `start`, `end`, `serve_toss_time`, `serve_contact_time`, `hit_times`,
  `end_reason`, `confidence` and the rally's `strokes`
- `strokes`: `stroke_type`, `category`, keyframes with angles, and metrics
- `clips`: `[{index, start, end}]`, the input for the FFmpeg cutting worker
- `skeletons`: per-stroke 2D landmark tracks plus skeleton edges, for the canvas overlay
- `summary`: overall counts and totals

## Roadmap

- **Phase 2 – backend.**
  - Chunked resumable uploads.
  - Celery tasks that wrap `analyze_match`.
  - Job progress over SSE.
  - The FFmpeg worker: stream-copy cuts on keyframes where possible, re-encode only the
    clip edges, and concat into the rally-only video.
  - JSON export.
- **Phase 3 – frontend.**
  - Drag-and-drop chunked uploader with progress.
  - Player with dual timelines (full match vs. rallies) and stroke markers.
  - Playback speed 0.25–2×, and stepping by keyframe.
  - Skill filter tabs.
  - Canvas skeleton overlay.
  - Synced split-screen pro comparison.
- **Model upgrades.** TrackNet / fine-tuned YOLOv11 ball weights, a learned stroke classifier,
  and a calibrated pro library.
