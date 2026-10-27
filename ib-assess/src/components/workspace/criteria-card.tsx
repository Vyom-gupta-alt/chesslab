"use client";

import { useActiveSyllabus } from "@/lib/store";
import { MYP_GRADE_BOUNDARIES } from "@/lib/grading";

/** Assessment criteria for the active syllabus; for MYP also the /32 → 1–7 grade boundaries. */
export function CriteriaCard() {
  const syllabus = useActiveSyllabus();
  if (!syllabus?.criteria.length) return null;
  const isMyp = syllabus.programme === "MYP";

  return (
    <div className="rounded-lg border bg-card p-5">
      <h2 className="font-semibold">{isMyp ? "MYP assessment criteria" : "Internal assessment criteria"}</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {syllabus.criteria.map((c) => (
          <li key={c.code} className="rounded-md border p-3 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-medium">
                Criterion {c.code}: {c.title}
              </p>
              <span className="shrink-0 text-xs text-muted-foreground">/{c.maxMarks}</span>
            </div>
            {c.strands && (
              <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                {c.strands.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {isMyp && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Grade boundaries (total of A–D, out of 32)
          </p>
          <div className="mt-1.5 grid grid-cols-7 overflow-hidden rounded-md border text-center text-xs">
            {MYP_GRADE_BOUNDARIES.map((b) => (
              <div key={b.grade} className="border-r last:border-r-0">
                <p className="bg-muted py-1 font-semibold">{b.grade}</p>
                <p className="py-1 tabular-nums text-muted-foreground">
                  {b.min}–{b.max}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
