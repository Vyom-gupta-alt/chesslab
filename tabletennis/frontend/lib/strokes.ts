import type { Analysis, Stroke } from "./api";

export const STROKE_LABELS: Record<string, string> = {
  serve_pendulum: "Pendulum serve",
  serve_reverse_pendulum: "Reverse pendulum serve",
  serve_tomahawk: "Tomahawk serve",
  serve_backhand: "Backhand serve",
  receive_short_flick: "Short flick",
  receive_long_flick: "Long flick",
  receive_push: "Push receive",
  forehand_topspin: "Forehand topspin",
  backhand_topspin: "Backhand topspin",
  forehand_push: "Forehand push",
  backhand_push: "Backhand push",
  block: "Block",
  counter_drive: "Counter-drive",
  chop: "Chop",
  lob: "Lob",
  smash: "Smash",
  unknown: "Unclassified",
};

export const strokeLabel = (t: string) => STROKE_LABELS[t] ?? t.replace(/_/g, " ");

/** Marker colour family for the timeline. */
export function strokeFamily(t: string): "serve" | "receive" | "attack" | "control" {
  if (t.startsWith("serve_")) return "serve";
  if (t.startsWith("receive_")) return "receive";
  if (["forehand_topspin", "backhand_topspin", "smash", "counter_drive"].includes(t)) return "attack";
  return "control";
}

export const FAMILY_CLASS = {
  serve: "bg-stroke-serve",
  receive: "bg-stroke-receive",
  attack: "bg-stroke-attack",
  control: "bg-stroke-control",
} as const;

export const SKILL_TABS: { id: string; label: string; types: string[] | null }[] = [
  { id: "all", label: "All", types: null },
  { id: "serve", label: "Serve", types: ["serve_pendulum", "serve_reverse_pendulum", "serve_tomahawk", "serve_backhand"] },
  { id: "receive", label: "Receive", types: ["receive_short_flick", "receive_long_flick", "receive_push"] },
  { id: "push", label: "Push", types: ["forehand_push", "backhand_push", "receive_push"] },
  { id: "fh_loop", label: "Forehand Loop", types: ["forehand_topspin"] },
  { id: "bh_loop", label: "Backhand Loop", types: ["backhand_topspin"] },
  { id: "attack", label: "Attack", types: ["smash", "counter_drive"] },
  { id: "defence", label: "Block / Defence", types: ["block", "chop", "lob"] },
];

export const ALL_STROKE_TYPES = Object.keys(STROKE_LABELS).filter((t) => t !== "unknown");

export interface KeyedStroke extends Stroke {
  key: string; // "rally:index", matches skeleton / pose storage keys
}

export function keyedStrokes(a: Analysis): KeyedStroke[] {
  return a.rallies.flatMap((r) => r.strokes.map((s, k) => ({ ...s, key: `${r.index}:${k}` })));
}

export const PHASE_LABEL = {
  preparation: "Backswing",
  contact: "Contact",
  follow_through: "Follow-through",
} as const;

export const ANGLE_LABELS: Record<string, string> = {
  elbow: "Elbow",
  knee_flexion: "Knee bend",
  hip_rotation: "Hip rotation",
  shoulder_rotation: "Shoulder rotation",
  x_factor: "Trunk twist",
  trunk_lean: "Trunk lean",
  shoulder_abduction: "Arm raise",
};

export function fmtTime(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec < 10 ? "0" : ""}${sec.toFixed(1)}`;
}

export function fmtDuration(s?: number): string {
  if (!s) return "–";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return h ? `${h}h ${m}m` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function fmtBytes(n: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}
