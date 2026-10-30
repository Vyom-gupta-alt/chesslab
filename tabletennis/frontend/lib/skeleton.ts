// Canvas skeleton drawing + time interpolation helpers.
import type { PhaseTimes } from "./api";

export const EDGES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [15, 19], [16, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32], [27, 29], [28, 30], [0, 11], [0, 12],
];
const RIGHT = new Set([12, 14, 16, 20, 24, 26, 28, 30, 32]);

/** Landmarks at time t, linearly interpolated between frames. */
export function sampleTrack(times: number[], frames: number[][][], t: number): number[][] | null {
  const n = times.length;
  if (!n || t < times[0] - 0.05 || t > times[n - 1] + 0.05) return null;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  const span = times[hi] - times[lo];
  const u = span > 0 ? Math.min(Math.max((t - times[lo]) / span, 0), 1) : 0;
  return frames[lo].map((p, j) => p.map((v, k) => v + (frames[hi][j][k] - v) * u));
}

/** Where the video picture actually sits inside its element (object-fit: contain). */
export function contentRect(video: HTMLVideoElement, w: number, h: number) {
  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const scale = Math.min(w / vw, h / vh);
  const cw = vw * scale;
  const ch = vh * scale;
  return { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch };
}

export interface DrawOptions {
  color?: string;
  rightColor?: string;
  lineWidth?: number;
  alpha?: number;
  playingArm?: "right" | "left";
}

/** Draw a skeleton whose points are already in canvas pixels. */
export function drawSkeleton(ctx: CanvasRenderingContext2D, pts: number[][], o: DrawOptions = {}) {
  const color = o.color ?? "#38bdf8";
  const right = o.rightColor ?? color;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.lineCap = "round";
  ctx.lineWidth = o.lineWidth ?? 3;
  const vis = (i: number) => (pts[i][2] ?? 1) > 0.3;
  for (const [a, b] of EDGES) {
    if (!pts[a] || !pts[b] || !vis(a) || !vis(b)) continue;
    const playing = o.playingArm && [13, 15, 19, 14, 16, 20].includes(b)
      && (o.playingArm === "right") === RIGHT.has(b);
    ctx.strokeStyle = playing ? "#facc15" : RIGHT.has(b) && RIGHT.has(a) ? right : color;
    ctx.lineWidth = (o.lineWidth ?? 3) * (playing ? 1.4 : 1);
    ctx.beginPath();
    ctx.moveTo(pts[a][0], pts[a][1]);
    ctx.lineTo(pts[b][0], pts[b][1]);
    ctx.stroke();
  }
  ctx.fillStyle = "#f8fafc";
  for (let i = 11; i < 33; i++) {
    if (!pts[i] || !vis(i)) continue;
    ctx.beginPath();
    ctx.arc(pts[i][0], pts[i][1], (o.lineWidth ?? 3) * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Normalised [0..1] frame coords -> canvas pixels inside rect. */
export function toRect(pts: number[][], r: { x: number; y: number; w: number; h: number }) {
  return pts.map(([x, y, v]) => [r.x + x * r.w, r.y + y * r.h, v ?? 1]);
}

/** Overlay coords (metres, hip-centred, y down) -> canvas pixels centred in (w, h). */
export function fitOverlay(pts: number[][], w: number, h: number, scale: number) {
  const hip = [(pts[23][0] + pts[24][0]) / 2, (pts[23][1] + pts[24][1]) / 2];
  return pts.map(([x, y]) => [w / 2 + (x - hip[0]) * scale, h * 0.48 + (y - hip[1]) * scale, 1]);
}

const ANCHORS: (keyof PhaseTimes)[] = ["prep_start", "backswing_end", "contact", "follow_end"];

/**
 * Map a time in stroke A to the matching moment in stroke B, phase by phase
 * (backswing lines up with backswing, contact with contact...).
 */
export function mapPhaseTime(t: number, a: PhaseTimes, b: PhaseTimes): number {
  const xa = ANCHORS.map((k) => a[k]);
  const xb = ANCHORS.map((k) => b[k]);
  if (t <= xa[0]) return xb[0] + (t - xa[0]);
  if (t >= xa[3]) return xb[3] + (t - xa[3]);
  for (let i = 0; i < 3; i++) {
    if (t <= xa[i + 1]) {
      const span = xa[i + 1] - xa[i];
      const u = span > 1e-6 ? (t - xa[i]) / span : 1;
      return xb[i] + u * (xb[i + 1] - xb[i]);
    }
  }
  return xb[3];
}

/** Ratio of B's to A's duration for the phase containing t (for playbackRate sync). */
export function phaseRateRatio(t: number, a: PhaseTimes, b: PhaseTimes): number {
  const xa = ANCHORS.map((k) => a[k]);
  const xb = ANCHORS.map((k) => b[k]);
  for (let i = 0; i < 3; i++) {
    if (t >= xa[i] && t <= xa[i + 1]) {
      const da = xa[i + 1] - xa[i];
      return da > 1e-6 ? (xb[i + 1] - xb[i]) / da : 1;
    }
  }
  return 1;
}

export function phaseAt(t: number, p: PhaseTimes): "Ready" | "Backswing" | "Contact" | "Follow-through" | "Recovery" {
  if (t < p.prep_start) return "Ready";
  if (Math.abs(t - p.contact) < 0.035) return "Contact";
  if (t < p.contact) return "Backswing";
  if (t <= p.follow_end) return "Follow-through";
  return "Recovery";
}
