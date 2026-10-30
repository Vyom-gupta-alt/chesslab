"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, FileJson, Play } from "lucide-react";
import { api, media, watchJob, type Analysis, type VideoInfo } from "@/lib/api";
import { fmtDuration, fmtTime, keyedStrokes, type KeyedStroke } from "@/lib/strokes";
import { AppHeader } from "@/components/app-header";
import { JobStatus } from "@/components/job-status";
import { MatchPlayer, type SeekRequest } from "@/components/match-player";
import { StrokePanel } from "@/components/stroke-panel";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const END_REASON: Record<string, string> = {
  ball_out: "ball out", ball_dead: "ball lost", dribble: "ball died", audio_gap: "play stopped", timeout: "timeout",
};

function VideoDashboard() {
  const id = useSearchParams().get("id") ?? "";
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<KeyedStroke | null>(null);
  const [seek, setSeek] = useState<SeekRequest | null>(null);

  useEffect(() => {
    if (!id) return;
    api<VideoInfo>(`/api/videos/${id}`).then(setInfo).catch((e) => setError(e.message));
  }, [id]);

  const status = info?.job?.status;
  useEffect(() => {
    if (!id || !status || status === "done" || status === "failed") return;
    return watchJob(id, (job) => {
      setInfo((i) => (i ? { ...i, job } : i));
      if (job.status === "done") api<VideoInfo>(`/api/videos/${id}`).then(setInfo).catch(() => undefined);
    });
  }, [id, status]);

  useEffect(() => {
    if (status === "done") api<Analysis>(`/api/videos/${id}/analysis`).then(setAnalysis).catch((e) => setError(e.message));
  }, [id, status]);

  const strokes = useMemo(() => (analysis ? keyedStrokes(analysis) : []), [analysis]);
  const goto = useCallback((t: number, play = false) => setSeek({ t, play, nonce: Math.random() }), []);
  const select = (s: KeyedStroke) => { setSelected(s); goto(Math.max(s.start - 0.3, 0), true); };

  if (!id) return <p className="container py-8">No video selected.</p>;
  if (error) return <p className="container py-8 text-destructive">{error}</p>;
  if (!info) return <p className="container py-8 text-muted-foreground">Loading…</p>;

  if (status !== "done" || !analysis) {
    return (
      <main className="container max-w-2xl space-y-4 py-12">
        <h1 className="truncate text-2xl font-semibold">{info.filename}</h1>
        <Card>
          <CardContent className="space-y-3 pt-4">
            <JobStatus job={info.job ?? {}} />
            {status !== "failed" && (
              <p className="text-sm text-muted-foreground">
                You can leave this page; processing continues on the server. A one-hour match takes roughly
                15–40 minutes on a laptop.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    );
  }

  const duration = info.duration ?? 0;
  const removed = duration ? 1 - analysis.summary.rally_time / duration : 0;

  return (
    <main className="container space-y-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{info.filename}</h1>
          <p className="text-sm text-muted-foreground">
            {fmtDuration(duration)} match · {analysis.rallies.length} rallies · {strokes.length} strokes tagged ·{" "}
            {Math.round(removed * 100)}% dead time removed
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {info.has_highlights && (
            <a href={media.highlights(id, true)} className={buttonVariants({ size: "sm" })}>
              <Download /> Rally-only video
            </a>
          )}
          <a href={media.export(id)} className={buttonVariants({ size: "sm", variant: "outline" })}>
            <FileJson /> Export JSON
          </a>
        </div>
      </div>

      {[...(analysis.warnings ?? []), ...(info.job?.warnings ?? [])].filter((w, i, a) => a.indexOf(w) === i).map((w) => (
        <p key={w} className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{w}</p>
      ))}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <MatchPlayer videoId={id} duration={duration} fps={info.fps ?? 30} rallies={analysis.rallies}
          strokes={strokes} selected={selected} seek={seek} />

        <Card className="flex max-h-[640px] flex-col">
          <CardHeader><CardTitle>Rallies</CardTitle></CardHeader>
          <CardContent className="flex-1 space-y-1 overflow-y-auto">
            {analysis.rallies.length === 0 && (
              <p className="text-sm text-muted-foreground">No rallies found. Is the table visible and is there sound?</p>
            )}
            {analysis.rallies.map((r) => (
              <div key={r.index} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                <button onClick={() => goto(r.start, true)} className="flex flex-1 items-center gap-3 text-left">
                  <Play className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>
                    <span className="block">
                      <span className="font-medium tabular-nums">Rally {r.index + 1}</span>
                      <span className="ml-2 tabular-nums text-muted-foreground">{fmtTime(r.start)}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {r.duration.toFixed(1)}s · {r.hit_times.length} hits · {r.strokes.length} strokes ·{" "}
                      {END_REASON[r.end_reason] ?? r.end_reason}
                    </span>
                  </span>
                </button>
                <a href={media.clip(id, r.index, true)} title="Download clip"
                  className={cn(buttonVariants({ size: "icon", variant: "ghost" }), "h-7 w-7")}>
                  <Download />
                </a>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Strokes</CardTitle></CardHeader>
        <CardContent>
          {strokes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No strokes were tagged. Stroke tagging needs a clearly visible player and pose analysis enabled.
            </p>
          ) : (
            <StrokePanel videoId={id} strokes={strokes} selected={selected} onSelect={select}
              onSeek={(t) => goto(t)} />
          )}
        </CardContent>
      </Card>
    </main>
  );
}

export default function VideoPage() {
  return (
    <>
      <AppHeader />
      <Suspense fallback={<p className="container py-8 text-muted-foreground">Loading…</p>}>
        <VideoDashboard />
      </Suspense>
    </>
  );
}
