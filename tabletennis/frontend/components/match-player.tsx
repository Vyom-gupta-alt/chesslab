"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bone, ChevronFirst, ChevronLast, Pause, Play, Repeat, Scissors, StepBack, StepForward,
} from "lucide-react";
import { api, media, type Rally, type SkeletonTrack } from "@/lib/api";
import { contentRect, drawSkeleton, sampleTrack, toRect } from "@/lib/skeleton";
import { FAMILY_CLASS, fmtTime, strokeFamily, strokeLabel, type KeyedStroke } from "@/lib/strokes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2];

export interface SeekRequest {
  t: number;
  nonce: number;
  play?: boolean;
}

interface Props {
  videoId: string;
  duration: number;
  fps: number;
  rallies: Rally[];
  strokes: KeyedStroke[];
  selected: KeyedStroke | null;
  seek: SeekRequest | null;
  onTime?: (t: number) => void;
}

export function MatchPlayer({ videoId, duration, fps, rallies, strokes, selected, seek, onTime }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [mode, setMode] = useState<"full" | "rallies">("rallies");
  const [skeletonOn, setSkeletonOn] = useState(false);
  const [loop, setLoop] = useState(false);
  const [overlayLabel, setOverlayLabel] = useState<string | null>(null);

  // live values for the animation loop (avoids re-subscribing every render)
  const live = useRef({ mode, loop, selected, skeletonOn, rallies, strokes });
  live.current = { mode, loop, selected, skeletonOn, rallies, strokes };

  const skeletons = useRef(new Map<string, SkeletonTrack | null>());
  const fetchSkeleton = useCallback((key: string) => {
    if (skeletons.current.has(key)) return;
    skeletons.current.set(key, null);
    api<SkeletonTrack>(`/api/videos/${videoId}/skeletons/${encodeURIComponent(key)}`)
      .then((s) => skeletons.current.set(key, s))
      .catch(() => undefined);
  }, [videoId]);

  const keyframes = useMemo(() => {
    const ks = strokes.flatMap((s) => s.keyframes.map((k) => k.time));
    const base = ks.length ? ks : rallies.map((r) => r.serve_contact_time);
    return Array.from(new Set(base.map((x) => Math.round(x * 1000) / 1000))).sort((a, b) => a - b);
  }, [strokes, rallies]);

  // ------------------------------------------------------------- drawing
  const draw = useCallback((time: number) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    let label: string | null = null;
    if (live.current.skeletonOn) {
      const s = live.current.strokes.find((x) => time >= x.time - 0.75 && time <= x.time + 0.55);
      if (s) {
        fetchSkeleton(s.key);
        const track = skeletons.current.get(s.key);
        const pts = track && sampleTrack(track.times, track.landmarks, time);
        if (track && pts) {
          drawSkeleton(ctx, toRect(pts, contentRect(video, w, h)), {
            color: "#38bdf8", rightColor: "#a78bfa", lineWidth: 3, playingArm: s.handedness,
          });
          const ph = track.phases;
          const tt = track.times;
          const phase = time < tt[ph.prep_start] ? "Ready"
            : Math.abs(time - tt[ph.contact]) < 1.5 / fps ? "Contact"
            : time < tt[ph.contact] ? "Backswing"
            : time <= tt[ph.follow_end] ? "Follow-through" : "Recovery";
          label = `${strokeLabel(s.stroke_type)} · ${phase}`;
        }
      }
    }
    setOverlayLabel((prev) => (prev === label ? prev : label));
  }, [fetchSkeleton, fps]);

  // ------------------------------------------------------------- main loop
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) {
        const now = v.currentTime;
        const { mode: m, loop: lp, selected: sel, rallies: rs } = live.current;
        if (!v.paused) {
          if (lp && sel && now > sel.end + 0.25) {
            v.currentTime = Math.max(sel.start - 0.25, 0);
          } else if (m === "rallies" && rs.length) {
            const inRally = rs.some((r) => now >= r.start - 0.05 && now < r.end);
            if (!inRally) {
              const next = rs.find((r) => r.start > now);
              if (next) v.currentTime = next.start;
              else v.pause();
            }
          }
        }
        setT(now);
        onTime?.(now);
        draw(now);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [draw, onTime]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, [rate]);

  // external seek requests (clicking a stroke / rally)
  useEffect(() => {
    const v = videoRef.current;
    if (!seek || !v) return;
    v.currentTime = Math.max(seek.t, 0);
    if (seek.play) v.play().catch(() => undefined);
  }, [seek]);

  // ------------------------------------------------------------- controls
  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (mode === "rallies" && rallies.length && !rallies.some((r) => v.currentTime >= r.start && v.currentTime < r.end)) {
        const next = rallies.find((r) => r.start > v.currentTime) ?? rallies[0];
        v.currentTime = next.start;
      }
      v.play().catch(() => undefined);
    } else v.pause();
  };
  const stepFrame = (dir: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.min(Math.max(v.currentTime + dir / fps, 0), duration);
  };
  const stepKeyframe = (dir: number) => {
    const v = videoRef.current;
    if (!v || !keyframes.length) return;
    v.pause();
    const now = v.currentTime;
    const target = dir > 0 ? keyframes.find((k) => k > now + 0.01) : [...keyframes].reverse().find((k) => k < now - 0.01);
    if (target !== undefined) v.currentTime = target;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); e.shiftKey ? stepKeyframe(1) : stepFrame(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); e.shiftKey ? stepKeyframe(-1) : stepFrame(-1); }
      else if (e.key === "s") setSkeletonOn((x) => !x);
      else if (e.key === "l") setLoop((x) => !x);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const seekTo = (time: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.min(Math.max(time, 0), duration);
  };

  return (
    <div className="space-y-3">
      <div ref={wrapRef} className="relative overflow-hidden rounded-lg border bg-black">
        <video
          ref={videoRef}
          src={media.source(videoId)}
          className="aspect-video w-full"
          playsInline
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onClick={toggle}
        />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        {overlayLabel && (
          <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white">
            {overlayLabel}
          </div>
        )}
        {mode === "rallies" && (
          <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-xs text-white">
            <Scissors className="h-3 w-3" /> Rallies only
          </div>
        )}
      </div>

      <DualTimeline duration={duration} rallies={rallies} strokes={strokes} t={t} mode={mode}
        selectedKey={selected?.key} onSeek={seekTo} />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon" variant="secondary" onClick={() => stepKeyframe(-1)} title="Previous keyframe (Shift+←)">
          <ChevronFirst />
        </Button>
        <Button size="icon" variant="secondary" onClick={() => stepFrame(-1)} title="Previous frame (←)">
          <StepBack />
        </Button>
        <Button size="icon" onClick={toggle} title="Play / pause (Space)">{playing ? <Pause /> : <Play />}</Button>
        <Button size="icon" variant="secondary" onClick={() => stepFrame(1)} title="Next frame (→)">
          <StepForward />
        </Button>
        <Button size="icon" variant="secondary" onClick={() => stepKeyframe(1)} title="Next keyframe (Shift+→)">
          <ChevronLast />
        </Button>
        <span className="px-2 font-mono text-sm tabular-nums text-muted-foreground">
          {fmtTime(t)} / {fmtTime(duration)}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-md bg-secondary p-0.5" role="group" aria-label="Playback speed">
            {SPEEDS.map((s) => (
              <button key={s} onClick={() => setRate(s)}
                className={cn("rounded px-2 py-1 text-xs tabular-nums",
                  rate === s ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground")}>
                {s}×
              </button>
            ))}
          </div>
          <div className="flex rounded-md bg-secondary p-0.5" role="group" aria-label="Playback mode">
            {(["rallies", "full"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={cn("rounded px-2 py-1 text-xs",
                  mode === m ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground")}>
                {m === "full" ? "Full match" : "Rallies only"}
              </button>
            ))}
          </div>
          <Button size="sm" variant={skeletonOn ? "default" : "outline"} onClick={() => setSkeletonOn((x) => !x)} title="Show body lines over the player (S)">
            <Bone /> Body lines
          </Button>
          <Button size="sm" variant={loop ? "default" : "outline"} onClick={() => setLoop((x) => !x)}
            disabled={!selected} title="Loop the selected stroke (L)">
            <Repeat /> Loop stroke
          </Button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ timelines
function DualTimeline({ duration, rallies, strokes, t, mode, selectedKey, onSeek }: {
  duration: number;
  rallies: Rally[];
  strokes: KeyedStroke[];
  t: number;
  mode: "full" | "rallies";
  selectedKey?: string;
  onSeek: (t: number) => void;
}) {
  const total = rallies.reduce((acc, r) => acc + (r.end - r.start), 0);
  const offsets = useMemo(() => {
    let acc = 0;
    return rallies.map((r) => { const o = acc; acc += r.end - r.start; return o; });
  }, [rallies]);
  const toVirtual = (time: number) => {
    const i = rallies.findIndex((r) => time >= r.start && time <= r.end);
    return i < 0 ? null : offsets[i] + (time - rallies[i].start);
  };
  const fromVirtual = (v: number) => {
    for (let i = rallies.length - 1; i >= 0; i--) if (v >= offsets[i]) return rallies[i].start + (v - offsets[i]);
    return rallies[0]?.start ?? 0;
  };
  const click = (e: React.MouseEvent<HTMLDivElement>, f: (frac: number) => number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(f((e.clientX - rect.left) / rect.width));
  };
  const pct = (x: number, of: number) => `${(of > 0 ? (x / of) * 100 : 0).toFixed(3)}%`;
  const vt = toVirtual(t);

  return (
    <div className="space-y-2 text-xs">
      <TimelineRow label="Full match" active={mode === "full"}>
        <div className="relative h-7 cursor-pointer rounded bg-secondary" onClick={(e) => click(e, (f) => f * duration)}>
          {rallies.map((r) => (
            <div key={r.index} className="absolute inset-y-0 rounded-sm bg-primary/25"
              style={{ left: pct(r.start, duration), width: pct(r.end - r.start, duration) }}
              title={`Rally ${r.index + 1}: ${fmtTime(r.start)}–${fmtTime(r.end)}`} />
          ))}
          {strokes.map((s) => (
            <div key={s.key} title={`${strokeLabel(s.stroke_type)} · ${fmtTime(s.time)}`}
              className={cn("absolute bottom-0 h-3 w-0.5 -translate-x-1/2", FAMILY_CLASS[strokeFamily(s.stroke_type)],
                s.key === selectedKey && "h-full w-1")}
              style={{ left: pct(s.time, duration) }} />
          ))}
          <div className="absolute inset-y-[-3px] w-0.5 bg-white shadow" style={{ left: pct(t, duration) }} />
        </div>
      </TimelineRow>
      <TimelineRow label="Rallies only" active={mode === "rallies"}>
        <div className="relative h-7 cursor-pointer overflow-hidden rounded bg-secondary"
          onClick={(e) => total > 0 && click(e, (f) => fromVirtual(f * total))}>
          {rallies.map((r, i) => (
            <div key={r.index} className="absolute inset-y-0 border-r border-background bg-primary/25"
              style={{ left: pct(offsets[i], total), width: pct(r.end - r.start, total) }}
              title={`Rally ${r.index + 1}`} />
          ))}
          {strokes.map((s) => {
            const v = toVirtual(s.time);
            return v === null ? null : (
              <div key={s.key} className={cn("absolute bottom-0 h-3 w-0.5 -translate-x-1/2", FAMILY_CLASS[strokeFamily(s.stroke_type)],
                s.key === selectedKey && "h-full w-1")}
                style={{ left: pct(v, total) }} />
            );
          })}
          {vt !== null && <div className="absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: pct(vt, total) }} />}
          {!rallies.length && <span className="absolute inset-0 grid place-items-center text-muted-foreground">No rallies found</span>}
        </div>
      </TimelineRow>
      <div className="flex flex-wrap gap-3 pl-24 text-muted-foreground">
        {(["serve", "receive", "attack", "control"] as const).map((f) => (
          <span key={f} className="inline-flex items-center gap-1 capitalize">
            <span className={cn("h-2.5 w-2.5 rounded-sm", FAMILY_CLASS[f])} /> {f}
          </span>
        ))}
        <span className="ml-auto hidden sm:inline">Space play · ←/→ frame · Shift+←/→ keyframe · S body lines · L loop</span>
      </div>
    </div>
  );
}

function TimelineRow({ label, active, children }: { label: string; active: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn("shrink-0 text-right", active ? "font-medium text-foreground" : "text-muted-foreground")}
        style={{ width: "5.25rem" }}>
        {label}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  );
}
