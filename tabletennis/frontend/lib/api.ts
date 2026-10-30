// Typed client for the FastAPI backend (same origin in production, proxied in dev).

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface Job {
  status?: JobStatus;
  stage?: string;
  message?: string;
  progress?: number;
  error?: string | null;
  warnings?: string[];
}

export interface VideoInfo {
  id: string;
  filename: string;
  size: number;
  created_at: number;
  duration?: number;
  fps?: number;
  width?: number;
  height?: number;
  has_audio?: boolean;
  has_highlights?: boolean;
  job: Job;
}

export interface Keyframe {
  phase: "preparation" | "contact" | "follow_through";
  time: number;
  frame_index: number;
  angles: Record<string, number>;
}

export interface Stroke {
  time: number;
  stroke_type: string;
  category: string;
  confidence: number;
  handedness: "right" | "left";
  start: number;
  end: number;
  keyframes: Keyframe[];
  metrics: Record<string, number>;
  rally_index: number;
}

export interface Rally {
  index: number;
  start: number;
  end: number;
  duration: number;
  serve_toss_time: number;
  serve_contact_time: number;
  last_hit_time: number;
  end_reason: string;
  confidence: number;
  hit_times: number[];
  strokes: Stroke[];
}

export interface Analysis {
  video: string;
  rallies: Rally[];
  strokes: Stroke[];
  clips: { index: number; start: number; end: number }[];
  warnings?: string[];
  summary: { rally_count: number; rally_time: number; stroke_counts: Record<string, number> };
}

export interface SkeletonTrack {
  times: number[];
  landmarks: number[][][]; // T x 33 x [x, y, visibility], normalised to the frame
  edges: [number, number][];
  phases: { prep_start: number; backswing_end: number; contact: number; follow_end: number };
}

export interface PhaseTimes {
  prep_start: number;
  backswing_end: number;
  contact: number;
  follow_end: number;
}

export interface ProSummary {
  id: string;
  player: string;
  stroke_type: string;
  context: string;
  handedness: string;
  synthetic: boolean;
  video_id?: string | null;
  clip_start?: number | null;
  clip_end?: number | null;
  similarity?: number;
}

export interface CompareTrack {
  times: number[];
  landmarks: number[][][];
  overlay: number[][][]; // T x 33 x [x, y] metres, facing the viewer
  handedness: string;
  phase_times: PhaseTimes;
}

export interface MetricDiff {
  label: string;
  unit: string;
  user: number;
  pro: number;
  delta: number;
  within_tolerance: boolean;
}

export interface CompareResult {
  match: {
    similarity: number;
    dtw_cost: number;
    racket_path_error: number;
    metric_diffs: Record<string, MetricDiff>;
    cues: string[];
  };
  user: CompareTrack;
  pro: ProSummary & CompareTrack;
}

export interface Health {
  status: string;
  queue: string;
  pose_available: boolean;
  chunk_size: number;
}

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : body.detail?.message ?? JSON.stringify(body.detail);
    } catch {
      /* not JSON */
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const media = {
  source: (id: string) => `${API_BASE}/api/videos/${id}/source`,
  highlights: (id: string, download = false) =>
    `${API_BASE}/api/videos/${id}/highlights${download ? "?download=true" : ""}`,
  clip: (id: string, index: number, download = false) =>
    `${API_BASE}/api/videos/${id}/clips/${index}${download ? "?download=true" : ""}`,
  export: (id: string) => `${API_BASE}/api/videos/${id}/export`,
};

/** Subscribe to processing progress (Server-Sent Events). Returns an unsubscribe fn. */
export function watchJob(id: string, onJob: (job: Job) => void): () => void {
  const es = new EventSource(`${API_BASE}/api/videos/${id}/events`);
  es.onmessage = (e) => {
    const job = JSON.parse(e.data) as Job;
    onJob(job);
    if (job.status === "done" || job.status === "failed") es.close();
  };
  es.onerror = () => {
    // the stream closes normally when the job ends; reconnect is automatic otherwise
  };
  return () => es.close();
}

// ------------------------------------------------------------ chunked upload
interface UploadInit {
  upload_id: string;
  chunk_size: number;
  total_chunks: number;
}

function putChunk(url: string, blob: Blob, onProgress: (loaded: number) => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText || `HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network error"));
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(blob);
  });
}

const resumeKey = (f: File) => `tt-upload:${f.name}:${f.size}:${f.lastModified}`;

/**
 * Upload a (possibly multi-GB) file in chunks, 3 at a time, with retries.
 * If the page is reloaded mid-upload, picking the same file resumes it.
 */
export async function uploadVideo(
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  let init: UploadInit | null = null;
  let received = new Set<number>();
  try {
    const saved = localStorage.getItem(resumeKey(file));
    if (saved) {
      const status = await api<UploadInit & { received: number[] }>(`/api/uploads/${saved}`);
      init = status;
      received = new Set(status.received);
    }
  } catch {
    init = null;
  }
  if (!init) {
    init = await api<UploadInit>("/api/uploads", {
      method: "POST",
      body: JSON.stringify({ filename: file.name, size: file.size }),
    });
    try {
      localStorage.setItem(resumeKey(file), init.upload_id);
    } catch {
      /* storage unavailable: no resume, upload still works */
    }
  }

  const { upload_id, chunk_size, total_chunks } = init;
  const loaded = new Map<number, number>();
  received.forEach((i) => loaded.set(i, Math.min(chunk_size, file.size - i * chunk_size)));
  const report = () => {
    let sum = 0;
    loaded.forEach((v) => (sum += v));
    onProgress(Math.min(sum / file.size, 1));
  };
  report();

  const queue = Array.from({ length: total_chunks }, (_, i) => i).filter((i) => !received.has(i));
  const worker = async () => {
    for (;;) {
      const i = queue.shift();
      if (i === undefined) return;
      const blob = file.slice(i * chunk_size, Math.min((i + 1) * chunk_size, file.size));
      for (let attempt = 0; ; attempt++) {
        try {
          await putChunk(`${API_BASE}/api/uploads/${upload_id}/chunks/${i}`, blob, (n) => {
            loaded.set(i, n);
            report();
          }, signal);
          loaded.set(i, blob.size);
          report();
          break;
        } catch (err) {
          if (signal?.aborted || attempt >= 4) throw err;
          loaded.set(i, 0);
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  const done = await api<{ video_id: string }>(`/api/uploads/${upload_id}/complete`, { method: "POST" });
  try {
    localStorage.removeItem(resumeKey(file));
  } catch {
    /* ignore */
  }
  return done.video_id;
}
