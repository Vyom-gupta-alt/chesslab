"use client";

import { BookOpenCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/lib/store";

export function SubtopicDetail() {
  const syllabus = useAppStore((s) => s.syllabus);
  const selectedId = useAppStore((s) => s.selectedSubtopicId);

  const match = syllabus.topics
    .flatMap((t) => t.subtopics.map((st) => ({ topic: t, st })))
    .find(({ st }) => st.id === selectedId);

  if (!match) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
        <BookOpenCheck className="h-5 w-5 shrink-0" />
        Pick a subtopic from the sidebar to see its learning outcomes and command terms.
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
    </div>
  );
}
