"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Film, RotateCcw, Trash2 } from "lucide-react";
import { api, watchJob, type Health, type VideoInfo } from "@/lib/api";
import { fmtBytes, fmtDuration } from "@/lib/strokes";
import { AppHeader } from "@/components/app-header";
import { Uploader } from "@/components/uploader";
import { JobStatus } from "@/components/job-status";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  const router = useRouter();
  const [videos, setVideos] = useState<VideoInfo[] | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<VideoInfo[]>("/api/videos").then(setVideos).catch((e) => setError(String(e.message ?? e)));
  }, []);

  useEffect(() => {
    load();
    api<Health>("/api/health").then(setHealth).catch(() => setError("Can't reach the backend. Is the server running?"));
  }, [load]);

  // live progress for anything still processing
  const processing = (videos ?? []).filter((v) => v.job?.status === "queued" || v.job?.status === "running").map((v) => v.id);
  const processingKey = processing.join(",");
  useEffect(() => {
    if (!processingKey) return;
    const stops = processingKey.split(",").map((id) =>
      watchJob(id, (job) => {
        setVideos((vs) => vs?.map((v) => (v.id === id ? { ...v, job } : v)) ?? vs);
      }));
    return () => stops.forEach((s) => s());
  }, [processingKey]);

  const remove = async (id: string) => {
    if (!confirm("Delete this video and all its clips?")) return;
    await api(`/api/videos/${id}`, { method: "DELETE" }).catch((e) => alert(e.message));
    load();
  };
  const reprocess = async (id: string) => {
    await api(`/api/videos/${id}/reprocess`, { method: "POST" }).catch((e) => alert(e.message));
    load();
  };

  return (
    <>
      <AppHeader />
      <main className="container space-y-8 py-8">
        <section className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Your matches</h1>
          <p className="max-w-2xl text-muted-foreground">
            Upload a match. Dead time gets cut out automatically, every stroke is tagged and broken down
            into backswing, contact and follow-through, and you can compare any stroke with a reference.
          </p>
        </section>

        {error && <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">{error}</p>}
        {health && !health.pose_available && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            Pose analysis is off because MediaPipe isn&apos;t installed on the server. Rallies will still be
            cut, but strokes won&apos;t be tagged. Install it with <code>pip install mediapipe</code> and restart.
          </p>
        )}

        <Uploader onUploaded={(id) => router.push(`/video/?id=${id}`)} />

        <section className="space-y-3">
          {videos?.length === 0 && (
            <p className="text-sm text-muted-foreground">No videos yet. Your uploads will appear here.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {videos?.map((v) => (
              <Card key={v.id} className="flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 truncate">
                    <Film className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate">{v.filename}</span>
                  </CardTitle>
                  <CardDescription>
                    {fmtDuration(v.duration)} · {fmtBytes(v.size)} · {new Date(v.created_at * 1000).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  <JobStatus job={v.job ?? {}} compact />
                  <div className="flex gap-2">
                    <Link href={`/video/?id=${v.id}`} className={buttonVariants({ size: "sm" })}>
                      Open
                    </Link>
                    {v.job?.status === "failed" && (
                      <Button size="sm" variant="outline" onClick={() => reprocess(v.id)}>
                        <RotateCcw /> Reprocess
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="ml-auto" aria-label="Delete" onClick={() => remove(v.id)}>
                      <Trash2 />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
