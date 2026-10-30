"use client";
import { useCallback, useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";
import { uploadVideo } from "@/lib/api";
import { fmtBytes } from "@/lib/strokes";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function Uploader({ onUploaded }: { onUploaded: (videoId: string) => void }) {
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = useCallback(async (f: File) => {
    setFile(f);
    setError(null);
    setProgress(0);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const id = await uploadVideo(f, setProgress, ctrl.signal);
      setFile(null);
      onUploaded(id);
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      else setFile(null);
    }
  }, [onUploaded]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) start(f);
  };

  if (file) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate font-medium">{file.name}</p>
            <p className="text-sm text-muted-foreground">
              {error ? <span className="text-destructive">{error}</span>
                : `Uploading ${fmtBytes(file.size * progress)} of ${fmtBytes(file.size)}`}
            </p>
          </div>
          {error ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => start(file)}>Resume</Button>
              <Button size="sm" variant="ghost" onClick={() => setFile(null)}>Cancel</Button>
            </div>
          ) : (
            <Button size="icon" variant="ghost" aria-label="Cancel upload" onClick={() => abortRef.current?.abort()}>
              <X />
            </Button>
          )}
        </div>
        <Progress value={progress} className="mt-3" />
        <p className="mt-2 text-xs text-muted-foreground">
          Large files upload in chunks. If the connection drops, pick the same file again to resume.
        </p>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
        drag ? "border-primary bg-primary/10" : "border-border hover:border-primary/60 hover:bg-accent/40",
      )}
    >
      <UploadCloud className="h-10 w-10 text-primary" />
      <div>
        <p className="font-medium">Drop a match video here, or click to choose</p>
        <p className="text-sm text-muted-foreground">MP4, MOV, MKV, AVI or WebM · multi-GB files are fine</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mkv,.mts,.m2ts"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) start(f); e.target.value = ""; }}
      />
    </div>
  );
}
