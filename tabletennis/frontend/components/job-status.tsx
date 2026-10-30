"use client";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { Job } from "@/lib/api";
import { Progress } from "@/components/ui/progress";

export function JobStatus({ job, compact = false }: { job: Job; compact?: boolean }) {
  if (job.status === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
        <CheckCircle2 className="h-4 w-4" /> {job.message ?? "Ready"}
      </span>
    );
  }
  if (job.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-destructive" title={job.error ?? ""}>
        <AlertTriangle className="h-4 w-4" /> {compact ? "Failed" : job.error ?? "Failed"}
      </span>
    );
  }
  return (
    <div className="w-full space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {job.message ?? "Queued"}
        </span>
        <span className="tabular-nums text-muted-foreground">{Math.round((job.progress ?? 0) * 100)}%</span>
      </div>
      <Progress value={job.progress ?? 0} />
    </div>
  );
}
