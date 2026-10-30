"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Bookmark, Trash2 } from "lucide-react";
import { api, type CompareResult, type ProSummary } from "@/lib/api";
import { ALL_STROKE_TYPES, strokeLabel } from "@/lib/strokes";
import { AppHeader } from "@/components/app-header";
import { CompareView } from "@/components/compare-view";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function Compare() {
  const params = useSearchParams();
  const videoId = params.get("video") ?? "";
  const strokeKey = params.get("stroke") ?? "";
  const strokeType = params.get("type") ?? "";
  const [onlySameType, setOnlySameType] = useState(true);
  const [refs, setRefs] = useState<ProSummary[] | null>(null);
  const [proId, setProId] = useState<string | null>(null);
  const [data, setData] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRefs = useCallback(() => {
    const q = new URLSearchParams({ video_id: videoId, stroke_key: strokeKey });
    if (onlySameType && strokeType) q.set("stroke_type", strokeType);
    api<ProSummary[]>(`/api/compare/suggest?${q}`)
      .then((r) => {
        setRefs(r);
        setProId((cur) => (cur && r.some((x) => x.id === cur) ? cur : r[0]?.id ?? null));
      })
      .catch((e) => setError(e.message));
  }, [videoId, strokeKey, strokeType, onlySameType]);

  useEffect(() => { if (videoId && strokeKey) loadRefs(); }, [loadRefs, videoId, strokeKey]);

  useEffect(() => {
    if (!proId) { setData(null); return; }
    setData(null);
    api<CompareResult>("/api/compare", {
      method: "POST",
      body: JSON.stringify({ video_id: videoId, stroke_key: strokeKey, pro_id: proId }),
    }).then(setData).catch((e) => setError(e.message));
  }, [proId, videoId, strokeKey]);

  const removeRef = async (id: string) => {
    if (!confirm("Remove this reference stroke?")) return;
    await api(`/api/pros/${id}`, { method: "DELETE" }).catch((e) => alert(e.message));
    loadRefs();
  };

  if (!videoId || !strokeKey) return <p className="container py-8">Pick a stroke on a video page first.</p>;

  return (
    <main className="container space-y-6 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/video/?id=${videoId}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft /> Back to match
        </Link>
        <h1 className="text-2xl font-semibold">Compare: {strokeLabel(strokeType)}</h1>
      </div>
      {error && <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Reference strokes</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={onlySameType} onChange={(e) => setOnlySameType(e.target.checked)} />
                Only {strokeLabel(strokeType).toLowerCase()}
              </label>
              {refs?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No references of this type yet. Untick the box, or save a stroke from a pro&apos;s video below.
                </p>
              )}
              {refs?.map((r) => (
                <div key={r.id} className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm",
                  proId === r.id ? "border-primary bg-primary/10" : "border-transparent hover:bg-accent")}>
                  <button className="flex-1 text-left" onClick={() => setProId(r.id)}>
                    <span className="block font-medium">{r.player}</span>
                    <span className="text-xs text-muted-foreground">
                      {strokeLabel(r.stroke_type)} · {r.context.replace(/_/g, " ")} · {Math.round((r.similarity ?? 0) * 100)}% match
                    </span>
                  </button>
                  {!r.synthetic && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Remove" onClick={() => removeRef(r.id)}>
                      <Trash2 />
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
          <SaveAsReference videoId={videoId} strokeKey={strokeKey} strokeType={strokeType} onSaved={loadRefs} />
        </div>

        <div>
          {data ? <CompareView key={proId} userVideoId={videoId} data={data} /> : (
            <p className="text-muted-foreground">{proId ? "Comparing…" : "Choose a reference stroke."}</p>
          )}
        </div>
      </div>
    </main>
  );
}

function SaveAsReference({ videoId, strokeKey, strokeType, onSaved }: {
  videoId: string; strokeKey: string; strokeType: string; onSaved: () => void;
}) {
  const [player, setPlayer] = useState("");
  const [type, setType] = useState(strokeType || "forehand_topspin");
  const [context, setContext] = useState("any");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api("/api/pros", {
        method: "POST",
        body: JSON.stringify({ video_id: videoId, stroke_key: strokeKey, player, stroke_type: type, context }),
      });
      setDone(true);
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bookmark className="h-4 w-4" /> Save this stroke as a reference</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-xs text-muted-foreground">
          Uploaded a pro&apos;s or coach&apos;s video? Save their stroke here and compare your own strokes against it.
        </p>
        <input value={player} onChange={(e) => setPlayer(e.target.value)} placeholder="Player name"
          className="w-full rounded-md border bg-background px-2 py-1.5" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-md border bg-background px-2 py-1.5">
          {ALL_STROKE_TYPES.map((t) => <option key={t} value={t}>{strokeLabel(t)}</option>)}
        </select>
        <select value={context} onChange={(e) => setContext(e.target.value)} className="w-full rounded-md border bg-background px-2 py-1.5">
          <option value="any">Any incoming ball</option>
          <option value="vs_backspin">Against backspin</option>
          <option value="vs_topspin">Against topspin</option>
          <option value="vs_block">Against block</option>
        </select>
        <Button size="sm" className="w-full" disabled={busy || !player.trim()} onClick={save}>
          {done ? "Saved ✓" : busy ? "Saving…" : "Save reference"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ComparePage() {
  return (
    <>
      <AppHeader />
      <Suspense fallback={<p className="container py-8 text-muted-foreground">Loading…</p>}>
        <Compare />
      </Suspense>
    </>
  );
}
