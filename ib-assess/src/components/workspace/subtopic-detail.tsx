"use client";

import { BookOpenCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAppStore, useActiveSyllabus } from "@/lib/store";

export function SubtopicDetail() {
  const syllabus = useActiveSyllabus();
  const selectedId = useAppStore((s) => s.selectedSubtopicId);

  const match = syllabus?.topics
    .flatMap((t) => t.subtopics.map((st) => ({ topic: t, st })))
    .find(({ st }) => st.id === selectedId);

  if (!syllabus || !match) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
        <BookOpenCheck className="h-5 w-5 shrink-0" />
        {syllabus
          ? "Pick a subtopic from the sidebar to see its learning outcomes and command terms."
          : "No syllabus yet. Upload your subject guide, or load a sample from the sidebar to look around."}
      </div>
    );
  }

  const { topic, st } = match;
  return (
    <div className="rounded-lg border bg-card p-5">
      <p className="text-xs text-muted-foreground">
        Topic {topic.code} · {topic.title}
      </p>
      <h2 className="mt-1 text-lg font-semibold">
        {st.code} {st.title}
      </h2>
      <ul className="mt-4 space-y-3">
        {st.outcomes.map((o) => (
          <li key={o.id} className="text-sm">
            <p>{o.text}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge variant="outline">{o.level}</Badge>
              {o.commandTerms.map((c) => (
                <Badge key={c} variant="command">
                  {c}
                </Badge>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {syllabus.programme === "MYP" && (syllabus.keyConcepts?.length || syllabus.globalContexts?.length) ? (
        <div className="mt-5 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
          <ConceptList title="Key concepts" items={syllabus.keyConcepts} />
          <ConceptList title="Global contexts" items={syllabus.globalContexts} />
        </div>
      ) : null}
    </div>
  );
}

function ConceptList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((i) => (
          <Badge key={i} variant="secondary">
            {i}
          </Badge>
        ))}
      </div>
    </div>
  );
}
