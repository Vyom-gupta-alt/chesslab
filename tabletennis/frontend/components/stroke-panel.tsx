"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { GitCompareArrows } from "lucide-react";
import {
  ANGLE_LABELS, FAMILY_CLASS, PHASE_LABEL, SKILL_TABS, fmtTime, strokeFamily, strokeLabel, type KeyedStroke,
} from "@/lib/strokes";
import { buttonVariants } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const ANGLE_ORDER = ["elbow", "knee_flexion", "hip_rotation", "shoulder_rotation", "x_factor", "trunk_lean"];

export function StrokePanel({ videoId, strokes, selected, onSelect, onSeek }: {
  videoId: string;
  strokes: KeyedStroke[];
  selected: KeyedStroke | null;
  onSelect: (s: KeyedStroke) => void;
  onSeek: (t: number) => void;
}) {
  const [tab, setTab] = useState("all");
  const counts = useMemo(() => Object.fromEntries(SKILL_TABS.map((t) => [
    t.id, t.types ? strokes.filter((s) => t.types!.includes(s.stroke_type)).length : strokes.length,
  ])), [strokes]);
  const types = SKILL_TABS.find((t) => t.id === tab)?.types;
  const shown = types ? strokes.filter((s) => types.includes(s.stroke_type)) : strokes;

  return (
    <div className="space-y-3">
      <Tabs value={tab} onChange={setTab}
        items={SKILL_TABS.map((t) => ({ id: t.id, label: t.label, count: counts[t.id] }))} />
      <div className="grid gap-4 lg:grid-cols-5">
        <ul className="max-h-[420px] space-y-1 overflow-y-auto pr-1 lg:col-span-2">
          {shown.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">No strokes in this category.</li>
          )}
          {shown.map((s) => (
            <li key={s.key}>
              <button onClick={() => onSelect(s)}
                className={cn("flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  selected?.key === s.key ? "border-primary bg-primary/10" : "border-transparent hover:bg-accent")}>
                <span className={cn("h-8 w-1 rounded-full", FAMILY_CLASS[strokeFamily(s.stroke_type)])} />
                <span className="flex-1">
                  <span className="block font-medium">{strokeLabel(s.stroke_type)}</span>
                  <span className="text-xs text-muted-foreground">
                    Rally {s.rally_index + 1} · {fmtTime(s.time)} · {Math.round(s.confidence * 100)}% sure
                  </span>
                </span>
                <span className="text-right text-xs tabular-nums text-muted-foreground">
                  {s.metrics.racket_speed_peak?.toFixed(1)} m/s
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="lg:col-span-3">
          {selected ? <StrokeDetail videoId={videoId} s={selected} onSeek={onSeek} /> : (
            <div className="grid h-full min-h-40 place-items-center rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              Pick a stroke to see its backswing, contact and follow-through.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StrokeDetail({ videoId, s, onSeek }: { videoId: string; s: KeyedStroke; onSeek: (t: number) => void }) {
  const m = s.metrics;
  const facts: [string, string][] = [
    ["Racket speed", `${m.racket_speed_peak?.toFixed(1)} m/s`],
    ["Swing path", `${m.swing_angle_at_contact?.toFixed(0)}° ${m.swing_angle_at_contact >= 0 ? "upward" : "downward"}`],
    ["Contact in front of body", `${((m.contact_forward_of_com ?? 0) * 100).toFixed(0)} cm`],
    ["Contact to the side", `${((m.contact_lateral_of_com ?? 0) * 100).toFixed(0)} cm`],
    ["Contact height vs centre of mass", `${((m.contact_height_vs_com ?? 0) * 100).toFixed(0)} cm`],
    ["Backswing / follow-through", `${m.backswing_duration?.toFixed(2)} s / ${m.follow_through_duration?.toFixed(2)} s`],
  ];
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold">{strokeLabel(s.stroke_type)}</h3>
        <span className="text-sm text-muted-foreground">{s.handedness}-handed · {fmtTime(s.time)}</span>
        <Link href={`/compare/?video=${videoId}&stroke=${encodeURIComponent(s.key)}&type=${s.stroke_type}`}
          className={cn(buttonVariants({ size: "sm" }), "ml-auto")}>
          <GitCompareArrows /> Compare with a pro
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 font-medium">Angle</th>
              {s.keyframes.map((k) => (
                <th key={k.phase} className="py-1 font-medium">
                  <button onClick={() => onSeek(k.time)} className="underline-offset-2 hover:text-foreground hover:underline">
                    {PHASE_LABEL[k.phase]} ↗
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {ANGLE_ORDER.map((a) => (
              <tr key={a} className="border-t">
                <td className="py-1.5 text-muted-foreground">{ANGLE_LABELS[a]}</td>
                {s.keyframes.map((k) => <td key={k.phase} className="py-1.5">{k.angles[a]?.toFixed(0)}°</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 border-b border-dashed py-1">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Speeds are measured relative to the hips (arm and trunk action), so footwork isn&apos;t included.
      </p>
    </div>
  );
}
