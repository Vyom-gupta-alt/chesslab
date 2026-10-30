"""Command line entry point.

    ttvision analyze match.mp4 -o result.json [--config configs/default.yaml] [--no-pose]
    ttvision rallies match.mp4                 # rally timecodes only
    ttvision add-pro clip.mp4 --id ma_long_fh_01 --player "Ma Long" \
        --stroke forehand_topspin --context vs_backspin
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from .config import PipelineConfig


def _progress(stage: str, frac: float) -> None:
    print(f"\r[{stage:>8}] {frac * 100:5.1f}%", end="", file=sys.stderr, flush=True)
    if frac >= 1.0:
        print(file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="ttvision")
    p.add_argument("--config", help="YAML config file")
    p.add_argument("-v", "--verbose", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("analyze", help="full analysis: rallies, strokes, pose")
    a.add_argument("video")
    a.add_argument("-o", "--output", default="-")
    a.add_argument("--no-pose", action="store_true")

    r = sub.add_parser("rallies", help="rally timecodes only")
    r.add_argument("video")

    pro = sub.add_parser("add-pro", help="add a single-stroke clip to the pro library")
    pro.add_argument("video")
    pro.add_argument("--id", required=True)
    pro.add_argument("--player", required=True)
    pro.add_argument("--stroke", required=True)
    pro.add_argument("--context", default="any")
    pro.add_argument("--handedness", default="right", choices=["right", "left"])
    pro.add_argument("--start", type=float, default=0.0)
    pro.add_argument("--end", type=float, default=None)

    args = p.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(levelname)s %(name)s: %(message)s")
    cfg = PipelineConfig.load(args.config)

    if args.cmd == "analyze":
        from .pipeline import analyze_match

        result = analyze_match(args.video, cfg, _progress, with_pose=not args.no_pose)
        text = json.dumps(result, indent=2)
        if args.output == "-":
            print(text)
        else:
            Path(args.output).write_text(text)
        return 0

    if args.cmd == "rallies":
        from .pipeline import clip_timecodes
        from .rally.detector import RallyDetector

        rallies = RallyDetector(cfg).detect(args.video, _progress)
        print(json.dumps({"rallies": [x.to_dict() for x in rallies],
                          "clips": clip_timecodes(rallies)}, indent=2))
        return 0

    if args.cmd == "add-pro":
        from .matching.pro_matcher import ProLibrary
        from .pose.analyzer import PoseAnalyzer
        from .media.ffmpeg import probe

        end = args.end if args.end is not None else probe(args.video).duration
        cfg.pose.handedness = args.handedness
        seq = PoseAnalyzer(cfg.pose).track(args.video, args.start, end)
        out_dir = Path(cfg.matcher.library_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        ProLibrary.save(out_dir / f"{args.id}.json", seq, id=args.id, player=args.player,
                        stroke_type=args.stroke, context=args.context, handedness=args.handedness)
        print(f"saved {out_dir / (args.id + '.json')} ({len(seq.times)} frames)")
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
