"use client";

import { useState } from "react";
import { ChevronRight, Info, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LearningOutcome, Programme, Syllabus } from "@/types/syllabus";
import { cn, uid } from "@/lib/utils";

const LEVELS: Record<Programme, Syllabus["level"][]> = {
  DP: ["SL/HL", "SL", "HL"],
  MYP: ["Standard/Extended", "Standard", "Extended"],
};

/** Map levels when the user switches the detected programme. */
function convertLevels(s: Syllabus, to: Programme) {
  const outcome = (l: LearningOutcome["level"]): LearningOutcome["level"] =>
    to === "MYP" ? (l === "HL" || l === "AHL" || l === "Extended" ? "Extended" : "Standard") : l === "Extended" ? "HL" : l === "Standard" ? "SL" : l;
  s.programme = to;
  s.level = LEVELS[to][0];
  s.topics.forEach((t) => t.subtopics.forEach((st) => st.outcomes.forEach((o) => (o.level = outcome(o.level)))));
}

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

export interface SaveOptions {
  merge: boolean;
}

export function SyllabusEditor({
  initial,
  note,
  existing,
  onSave,
  onCancel,
}: {
  initial: Syllabus;
  note?: string;
  /** The user's current syllabus per programme, to offer "add to it". */
  existing: Record<Programme, Syllabus | null>;
  onSave: (s: Syllabus, opts: SaveOptions) => void;
  onCancel: () => void;
}) {
  const [s, setS] = useState<Syllabus>(initial);
  const [open, setOpen] = useState<Set<string>>(() => new Set(initial.topics.slice(0, 2).map((t) => t.id)));
  const [merge, setMerge] = useState(true);

  const edit = (fn: (draft: Syllabus) => void) =>
    setS((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });

  const counts = {
    topics: s.topics.length,
    subtopics: s.topics.reduce((a, t) => a + t.subtopics.length, 0),
    outcomes: s.topics.reduce((a, t) => a + t.subtopics.reduce((b, st) => b + st.outcomes.length, 0), 0),
  };
  const current = existing[s.programme];

  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-5">
      {note && (
        <p className="flex gap-2 rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" /> {note}
        </p>
      )}

      <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Programme</p>
          <Tabs value={s.programme} onValueChange={(v) => edit((d) => convertLevels(d, v as Programme))}>
            <TabsList>
              <TabsTrigger value="DP">DP</TabsTrigger>
              <TabsTrigger value="MYP">MYP</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Subject</span>
          <Input value={s.subject} onChange={(e) => edit((d) => void (d.subject = e.target.value))} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Level</span>
          <select
            value={s.level}
            onChange={(e) => edit((d) => void (d.level = e.target.value as Syllabus["level"]))}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {LEVELS[s.programme].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-sm text-muted-foreground">
        Found <strong className="text-foreground">{counts.topics}</strong> {plural(counts.topics, "topic")},{" "}
        <strong className="text-foreground">{counts.subtopics}</strong> {plural(counts.subtopics, "subtopic")} and{" "}
        <strong className="text-foreground">{counts.outcomes}</strong> learning {plural(counts.outcomes, "outcome")}. Click a title to edit it.
      </p>

      <ul className="space-y-3">
        {s.topics.map((t, ti) => (
          <li key={t.id} className="rounded-lg border bg-card">
            <div className="flex items-center gap-2 p-2">
              <button onClick={() => toggle(t.id)} aria-label={open.has(t.id) ? "Collapse" : "Expand"} className="rounded p-1 hover:bg-accent">
                <ChevronRight className={cn("h-4 w-4 transition-transform", open.has(t.id) && "rotate-90")} />
              </button>
              <Input className="h-8 w-14 text-center" value={t.code} aria-label="Topic number" onChange={(e) => edit((d) => void (d.topics[ti].code = e.target.value))} />
              <Input className="h-8 font-medium" value={t.title} aria-label="Topic title" onChange={(e) => edit((d) => void (d.topics[ti].title = e.target.value))} />
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{t.subtopics.length} subtopics</span>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Delete topic" onClick={() => edit((d) => void d.topics.splice(ti, 1))}>
                <Trash2 />
              </Button>
            </div>
            {open.has(t.id) && (
              <div className="space-y-2 border-t p-3 pl-10">
                {t.subtopics.map((st, si) => (
                  <div key={st.id} className="rounded-md border bg-background p-2">
                    <div className="flex items-center gap-2">
                      <Input className="h-8 w-16 text-center text-xs" value={st.code} aria-label="Subtopic number" onChange={(e) => edit((d) => void (d.topics[ti].subtopics[si].code = e.target.value))} />
                      <Input className="h-8" value={st.title} aria-label="Subtopic title" onChange={(e) => edit((d) => void (d.topics[ti].subtopics[si].title = e.target.value))} />
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Delete subtopic" onClick={() => edit((d) => void d.topics[ti].subtopics.splice(si, 1))}>
                        <Trash2 />
                      </Button>
                    </div>
                    {st.outcomes.length > 0 && (
                      <ul className="mt-2 space-y-1.5 pl-2">
                        {st.outcomes.map((o, oi) => (
                          <li key={o.id} className="group flex items-start gap-2 text-sm">
                            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p>{o.text}</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <Badge variant="outline" className="text-[10px]">{o.level}</Badge>
                                {o.commandTerms.map((c) => (
                                  <Badge key={c} variant="command" className="text-[10px]">{c}</Badge>
                                ))}
                              </div>
                            </div>
                            <button
                              aria-label="Delete outcome"
                              className="rounded p-1 text-muted-foreground opacity-60 hover:bg-accent hover:opacity-100"
                              onClick={() => edit((d) => void d.topics[ti].subtopics[si].outcomes.splice(oi, 1))}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    edit((d) =>
                      void d.topics[ti].subtopics.push({ id: uid("st"), code: `${t.code}.${t.subtopics.length + 1}`, title: "New subtopic", outcomes: [] }),
                    )
                  }
                >
                  <Plus /> Add subtopic
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          const id = uid("t");
          edit((d) => void d.topics.push({ id, code: String(d.topics.length + 1), title: "New topic", subtopics: [] }));
          setOpen((o) => new Set(o).add(id));
        }}
      >
        <Plus /> Add topic
      </Button>

      {s.criteria.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium">Assessment criteria</p>
          <ul className="mt-2 space-y-1 text-sm">
            {s.criteria.map((c, ci) => (
              <li key={c.code} className="flex items-center justify-between gap-2">
                <span>
                  Criterion {c.code}: {c.title} <span className="text-muted-foreground">/{c.maxMarks}</span>
                </span>
                <button aria-label="Delete criterion" className="rounded p-1 text-muted-foreground hover:bg-accent" onClick={() => edit((d) => void d.criteria.splice(ci, 1))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="sticky bottom-0 -mx-1 space-y-3 border-t bg-background/95 px-1 py-4 backdrop-blur">
        {current && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={merge} onChange={() => setMerge(true)} />
              Add to my {s.programme} syllabus ({current.subject})
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={!merge} onChange={() => setMerge(false)} />
              Replace it
            </label>
          </div>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={!s.topics.length} onClick={() => onSave(s, { merge: !!current && merge })}>
            <Save /> Save as my {s.programme} syllabus
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Start over
          </Button>
        </div>
      </div>
    </div>
  );
}
