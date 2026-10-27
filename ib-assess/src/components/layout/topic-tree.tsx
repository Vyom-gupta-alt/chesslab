"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Search } from "lucide-react";
import { useAppStore, useActiveSyllabus } from "@/lib/store";
import type { Topic } from "@/types/syllabus";
import { cn } from "@/lib/utils";

/** Collapsible Topic → Subtopic hierarchy for the active syllabus, with a filter box. */
export function TopicTree() {
  const syllabus = useActiveSyllabus();
  const selected = useAppStore((s) => s.selectedSubtopicId);
  const select = useAppStore((s) => s.selectSubtopic);
  const [query, setQuery] = useState("");
  const topics = useMemo(() => syllabus?.topics ?? [], [syllabus]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(topics.slice(0, 1).map((t) => t.id)));

  const filtered = useMemo<Topic[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return topics;
    return topics
      .map((t) => {
        const topicHit = `${t.code} ${t.title}`.toLowerCase().includes(q);
        const subs = t.subtopics.filter((st) =>
          [st.code, st.title, ...st.outcomes.map((o) => o.text)].join(" ").toLowerCase().includes(q),
        );
        return topicHit ? t : subs.length ? { ...t, subtopics: subs } : null;
      })
      .filter((t): t is Topic => t !== null);
  }, [topics, query]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!syllabus) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative px-3 pb-2">
        <Search className="pointer-events-none absolute left-5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter topics…"
          aria-label="Filter topics"
          className="h-8 w-full rounded-md border bg-background pl-7 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <ul role="tree" aria-label="Syllabus topics" className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {filtered.map((topic) => {
          const isOpen = !!query.trim() || expanded.has(topic.id);
          return (
            <li key={topic.id} role="treeitem" aria-expanded={isOpen} aria-selected={false}>
              <button
                onClick={() => toggle(topic.id)}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-accent"
              >
                <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isOpen && "rotate-90")} />
                <span className="w-5 shrink-0 text-xs text-muted-foreground">{topic.code}</span>
                <span className="truncate">{topic.title}</span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.ul
                    role="group"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    {topic.subtopics.map((st) => (
                      <li key={st.id} role="treeitem" aria-selected={selected === st.id}>
                        <button
                          onClick={() => select(st.id)}
                          className={cn(
                            "ml-5 flex w-[calc(100%-1.25rem)] items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground",
                            selected === st.id && "bg-primary/10 font-medium text-primary hover:bg-primary/15 hover:text-primary",
                          )}
                        >
                          <span className="w-8 shrink-0 text-xs tabular-nums">{st.code}</span>
                          <span className="truncate">{st.title}</span>
                        </button>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </li>
          );
        })}
        {filtered.length === 0 && <li className="px-2 py-4 text-sm text-muted-foreground">No topics match.</li>}
      </ul>
    </div>
  );
}
