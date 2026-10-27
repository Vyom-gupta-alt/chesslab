"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ClipboardPaste, FileText, ImageIcon, KeyRound, Loader2, Sparkles, Upload, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { draftToSyllabus } from "@/lib/ingest/draft";
import { sourceKind } from "@/lib/ingest/files";
import { loadApiKey, saveApiKey } from "@/lib/ingest/api-key";
import type { Syllabus } from "@/types/syllabus";
import { cn } from "@/lib/utils";

type Mode = "free" | "ai";

interface Source {
  id: string;
  file: File;
  preview?: string;
}

const MAX_TOTAL_MB_AI = 30;

export function IngestPanel({ onExtracted }: { onExtracted: (s: Syllabus, note?: string) => void }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("free");
  const [apiKey, setApiKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ p: number | null; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const k = loadApiKey();
    if (k) {
      setApiKey(k);
      setRemember(true);
      setMode("ai");
    }
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const accepted: Source[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(files)) {
      const kind = sourceKind(file);
      if (!kind) {
        rejected.push(file.name);
        continue;
      }
      accepted.push({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        preview: kind === "image" ? URL.createObjectURL(file) : undefined,
      });
    }
    setSources((s) => [...s, ...accepted]);
    setError(rejected.length ? `Skipped ${rejected.join(", ")}: use images, PDFs or .txt files.` : null);
  }, []);

  // Ctrl/Cmd+V a screenshot straight onto the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      addFiles(
        files.map((f, i) =>
          f.name && f.name !== "image.png" ? f : new File([f], `Pasted screenshot ${Date.now() % 10000}-${i + 1}.png`, { type: f.type }),
        ),
      );
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  // Release thumbnail URLs when leaving the page.
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  useEffect(() => () => sourcesRef.current.forEach((s) => s.preview && URL.revokeObjectURL(s.preview)), []);

  const remove = (id: string) =>
    setSources((s) => {
      const gone = s.find((x) => x.id === id);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return s.filter((x) => x.id !== id);
    });
  const hasInput = sources.length > 0 || text.trim().length > 0;
  const totalMb = sources.reduce((a, s) => a + s.file.size, 0) / 1_048_576;

  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      const files = sources.map((s) => s.file);
      if (mode === "ai") {
        if (!apiKey.trim()) throw new Error("Paste your Anthropic API key first, or switch to Free mode.");
        if (totalMb > MAX_TOTAL_MB_AI)
          throw new Error(`That's ${totalMb.toFixed(0)} MB. AI mode takes up to ${MAX_TOTAL_MB_AI} MB at once; upload the guide in parts.`);
        saveApiKey(remember ? apiKey.trim() : null);
        setProgress({ p: null, label: "Starting…" });
        const { extractWithClaude } = await import("@/lib/ingest/ai");
        const draft = await extractWithClaude(apiKey.trim(), { files, text }, (label) => setProgress({ p: null, label }));
        onExtracted(draftToSyllabus(draft));
      } else {
        setProgress({ p: 0, label: "Starting…" });
        const { extractFree } = await import("@/lib/ingest/free");
        const { draft, text: read } = await extractFree(files, text, (p, label) => setProgress({ p, label }));
        if (!read.trim()) throw new Error("No text could be read. Try a clearer screenshot, or AI mode.");
        const syl = draftToSyllabus(draft);
        onExtracted(
          syl,
          syl.topics.length
            ? "Free mode reads the guide's numbering (1, 1.1, 1.2…). Check the result below and fix anything it missed."
            : "Free mode couldn't find numbered topics in this material. Add them below, or try AI mode for messy pages and photos.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 font-medium">Drop screenshots, photos or PDFs here</p>
        <p className="mt-1 text-sm text-muted-foreground">
          or paste a screenshot with <kbd className="rounded border bg-muted px-1 text-xs">Ctrl</kbd>+
          <kbd className="rounded border bg-muted px-1 text-xs">V</kbd>
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <ImageIcon /> Choose files
          </Button>
          <Button variant="outline" size="sm" onClick={() => cameraInput.current?.click()}>
            <Camera /> Take a photo
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/*,application/pdf,.pdf,.txt,.md,text/plain"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {sources.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {sources.map((s) => (
            <li key={s.id} className="group relative overflow-hidden rounded-md border bg-card">
              {s.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.preview} alt={s.file.name} className="h-28 w-full object-cover object-top" />
              ) : (
                <div className="flex h-28 items-center justify-center bg-muted">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <p className="truncate px-2 py-1 text-xs" title={s.file.name}>
                {s.file.name}
              </p>
              <button
                onClick={() => remove(s.id)}
                aria-label={`Remove ${s.file.name}`}
                className="absolute right-1 top-1 rounded-full bg-background/90 p-1 shadow"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <label htmlFor="syllabus-text" className="flex items-center gap-1.5 text-sm font-medium">
          <ClipboardPaste className="h-4 w-4" /> Or paste the syllabus text
        </label>
        <textarea
          id="syllabus-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Topic 1: Number and algebra\n1.1 Scientific notation\n• Operations with numbers in the form a × 10^k\n1.2 Arithmetic sequences\n…"}
          className="mt-1.5 min-h-32 w-full resize-y rounded-md border bg-background p-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* Mode */}
      <div className="rounded-lg border bg-card p-4">
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="free">
              <Zap /> Free mode
            </TabsTrigger>
            <TabsTrigger value="ai">
              <Sparkles /> AI mode (Claude)
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {mode === "free" ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Reads text from screenshots and PDFs right in your browser and builds the tree from the guide&apos;s numbering
            (1, 1.1, 1.2…). Free and private. Works best on clean screenshots of the syllabus content pages.
          </p>
        ) : (
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-muted-foreground">
              Claude reads your files directly, including photos, tables and messy layouts, and tags every outcome with
              IB command terms. Uses your own Anthropic API key; a few screenshots cost a few cents, a full 100-page guide
              roughly $0.50.
            </p>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                type="password"
                autoComplete="off"
                placeholder="sk-ant-…"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                aria-label="Anthropic API key"
              />
            </div>
            <label className="flex items-center gap-2 text-muted-foreground">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember on this device
            </label>
            <p className="text-xs text-muted-foreground">
              Get a key at{" "}
              <a className="underline" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                console.anthropic.com
              </a>
              . It&apos;s sent only to Anthropic&apos;s API, never to Grade Maxxer.
            </p>
          </div>
        )}
      </div>

      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      {progress && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {progress.label}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full bg-primary transition-[width]", progress.p === null && "w-1/3 animate-pulse")}
              style={progress.p === null ? undefined : { width: `${Math.max(3, progress.p * 100)}%` }}
            />
          </div>
        </div>
      )}

      <Button size="lg" className="w-full" disabled={!hasInput || busy} onClick={run}>
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Read syllabus
      </Button>
    </div>
  );
}
