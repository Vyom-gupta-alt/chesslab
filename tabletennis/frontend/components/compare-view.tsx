"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Pause, Play, TriangleAlert } from "lucide-react";
import { media, type CompareResult } from "@/lib/api";
import {
  contentRect, drawSkeleton, mapPhaseTime, phaseAt, phaseRateRatio, sampleTrack, toRect,
} from "@/lib/skeleton";
import { fmtTime, strokeLabel } from "@/lib/strokes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SPEEDS = [0.25, 0.5, 1];
const USER_COLOR = "#38bdf8";
const PRO_COLOR = "#fb923c";

export function CompareView({ userVideoId, data }: { userVideoId: string; data: CompareResult }) {
  const { user, pro, match } = data;
  const uRef = useRef<HTMLVideoElement>(null);
  const pRef = useRef<HTMLVideoElement>(null);
  const uCanvas = useRef<HTMLCanvasElement>(null);
  const pCanvas = useRef<HTMLCanvasElement>(null);
  const [showLines, setShowLines] = useState(false);
  const [rate, setRate] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const [tU, setTU] = useState(user.phase_times.prep_start);

  const uStart = Math.max(user.phase_times.prep_start - 0.3, user.times[0]);
  const uEnd = Math.min(user.phase_times.follow_end + 0.3, user.times[user.times.length - 1]);
  const proHasVideo = Boolean(pro.video_id);
  const live = useRef({ rate, showLines });
  live.current = { rate, showLines };

  useEffect(() => {
    const u = uRef.current;
    if (!u) return;
    const init = () => { u.currentTime = uStart; };
    if (u.readyState >= 1) init();
    else u.addEventListener("loadedmetadata", init, { once: true });
  }, [uStart]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const u = uRef.current;
      const p = pRef.current;
      if (u) {
        if (!u.paused && u.currentTime >= uEnd) u.currentTime = uStart;          // loop the stroke
        const t = u.currentTime;
        const tp = mapPhaseTime(t, user.phase_times, pro.phase_times);
        if (p) {
          if (u.paused) {
            if (!p.paused) p.pause();
            if (Math.abs(p.currentTime - tp) > 0.01) p.currentTime = tp;
          } else {
            const r = live.current.rate * phaseRateRatio(t, user.phase_times, pro.phase_times);
            p.playbackRate = Math.min(Math.max(r, 0.0625), 4);
            if (Math.abs(p.currentTime - tp) > 0.12) p.currentTime = tp;
            if (p.paused) p.play().catch(() => undefined);
          }
        }
        drawAll(t, tp);
        setTU(t);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, uStart, uEnd]);

  useEffect(() => { if (uRef.current) uRef.current.playbackRate = rate; }, [rate]);

  function prep(canvas: HTMLCanvasElement | null) {
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function drawAll(t: number, tp: number) {
    const u = prep(uCanvas.current);
    const p = prep(pCanvas.current);
    if (!live.current.showLines) return;      // canvases cleared: plain video only
    const pts = sampleTrack(user.times, user.landmarks, t);
    if (u && pts && uRef.current) {
      drawSkeleton(u.ctx, toRect(pts, contentRect(uRef.current, u.w, u.h)), {
        color: USER_COLOR, playingArm: user.handedness as "right" | "left",
      });
    }
    const ppts = sampleTrack(pro.times, pro.landmarks, tp);
    if (p && ppts && pRef.current) {
      drawSkeleton(p.ctx, toRect(ppts, contentRect(pRef.current, p.w, p.h)), {
        color: PRO_COLOR, playingArm: pro.handedness as "right" | "left",
      });
    }
  }

  const toggle = () => {
    const u = uRef.current;
    if (!u) return;
    if (u.paused) u.play().catch(() => undefined);
    else u.pause();
  };
  const jump = (t: number) => {
    const u = uRef.current;
    if (!u) return;
    u.pause();
    u.currentTime = t;
  };

  const phase = phaseAt(tU, user.phase_times);
  const diffs = Object.entries(match.metric_diffs);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={showLines ? "default" : "outline"} onClick={() => setShowLines((x) => !x)}>
          {showLines ? "Hide body lines" : "Show body lines"}
        </Button>
        <span className="ml-2 inline-flex items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: USER_COLOR }} /> You</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PRO_COLOR }} /> {pro.player}</span>
        </span>
        <span className="ml-auto rounded bg-secondary px-2 py-1 text-sm font-medium">{phase}</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="You">
          <video ref={uRef} src={media.source(userVideoId)} className="aspect-video w-full" muted playsInline
            preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
          <canvas ref={uCanvas} className="pointer-events-none absolute inset-0 h-full w-full" />
        </Panel>
        <Panel title={`${pro.player} · ${strokeLabel(pro.stroke_type)}`}>
          {proHasVideo ? (
            <video ref={pRef} src={media.source(pro.video_id!)} className="aspect-video w-full" muted playsInline preload="auto" />
          ) : (
            <div className="grid aspect-video w-full place-items-center bg-gradient-to-b from-slate-900 to-slate-800 p-6 text-center text-sm text-slate-300">
              No video for this reference. Upload a pro&apos;s or coach&apos;s match, open one of their strokes and
              click &ldquo;Save this stroke as a reference&rdquo; to watch them side by side with you.
            </div>
          )}
          <canvas ref={pCanvas} className="pointer-events-none absolute inset-0 h-full w-full" />
        </Panel>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="icon" onClick={toggle}>{playing ? <Pause /> : <Play />}</Button>
          <Button size="sm" variant="secondary" onClick={() => jump(user.phase_times.backswing_end)}>Backswing</Button>
          <Button size="sm" variant="secondary" onClick={() => jump(user.phase_times.contact)}>Contact</Button>
          <Button size="sm" variant="secondary" onClick={() => jump(user.phase_times.follow_end)}>Follow-through</Button>
          <div className="ml-auto flex rounded-md bg-secondary p-0.5">
            {SPEEDS.map((s) => (
              <button key={s} onClick={() => setRate(s)}
                className={cn("rounded px-2 py-1 text-xs", rate === s ? "bg-background shadow" : "text-muted-foreground")}>
                {s}×
              </button>
            ))}
          </div>
        </div>
        <input type="range" min={uStart} max={uEnd} step={0.001} value={Math.min(Math.max(tU, uStart), uEnd)}
          onChange={(e) => jump(Number(e.target.value))} className="w-full accent-sky-400" aria-label="Scrub stroke" />
        <p className="text-xs text-muted-foreground">
          Playback is synced phase by phase: your backswing lines up with theirs, contact with contact.
          {" "}{fmtTime(tU)}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Movement similarity</p>
          <p className="text-4xl font-semibold tabular-nums">{Math.round(match.similarity * 100)}%</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Whole-body movement compared frame by frame after aligning the two strokes in time.
            Racket path difference: {match.racket_path_error.toFixed(2)} torso lengths.
          </p>
          {pro.synthetic && (
            <p className="mt-3 rounded bg-amber-500/10 p-2 text-xs text-amber-300">
              This reference is a synthetic demo stroke, not a recording of a real player. Add real reference
              strokes from the panel on the left.
            </p>
          )}
        </div>
        <div className="rounded-lg border p-4 lg:col-span-2">
          <p className="mb-2 text-sm font-medium">What to work on</p>
          {match.cues.length ? (
            <ol className="list-decimal space-y-1 pl-5 text-sm">{match.cues.map((c) => <li key={c}>{c}</li>)}</ol>
          ) : (
            <p className="text-sm text-muted-foreground">Everything is within tolerance of the reference. Nice.</p>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Metric</th>
              <th className="px-3 py-2 font-medium">You</th>
              <th className="px-3 py-2 font-medium">Reference</th>
              <th className="px-3 py-2 font-medium">Difference</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {diffs.map(([k, d]) => (
              <tr key={k} className="border-t">
                <td className="px-3 py-2">{d.label}</td>
                <td className="px-3 py-2">{fmt(d.user, d.unit)}</td>
                <td className="px-3 py-2">{fmt(d.pro, d.unit)}</td>
                <td className="px-3 py-2">{d.delta > 0 ? "+" : ""}{fmt(d.delta, d.unit)}</td>
                <td className="px-3 py-2">
                  {d.within_tolerance ? <Check className="h-4 w-4 text-emerald-400" /> : <TriangleAlert className="h-4 w-4 text-amber-400" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmt(v: number, unit: string) {
  return unit === "°" ? `${v.toFixed(0)}°` : `${v.toFixed(2)} ${unit}`;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="truncate text-xs font-medium text-muted-foreground">{title}</p>
      <div className="relative overflow-hidden rounded-lg border bg-black">{children}</div>
    </div>
  );
}
