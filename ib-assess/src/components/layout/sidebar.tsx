"use client";

import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TopicTree } from "./topic-tree";
import { useAppStore, useActiveSyllabus } from "@/lib/store";
import { PROGRAMME_LABELS } from "@/lib/grading";
import type { Programme } from "@/types/syllabus";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const open = useAppStore((s) => s.sidebarOpen);
  const syllabus = useActiveSyllabus();
  const programme = useAppStore((s) => s.programme);
  const setProgramme = useAppStore((s) => s.setProgramme);
  const toggle = useAppStore((s) => s.toggleSidebar);

  return (
    <>
      {/* Mobile backdrop */}
      {open && <div className="fixed inset-0 top-14 z-30 bg-black/30 lg:hidden" onClick={toggle} aria-hidden />}
      <aside
        aria-label="Syllabus"
        className={cn(
          "fixed bottom-0 left-0 top-14 z-30 flex w-72 flex-col border-r bg-muted/40 backdrop-blur transition-transform duration-200 lg:bg-muted/30",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="space-y-2 p-3">
          <Tabs value={programme} onValueChange={(v) => setProgramme(v as Programme)}>
            <TabsList className="grid w-full grid-cols-2">
              {(Object.keys(PROGRAMME_LABELS) as Programme[]).map((p) => (
                <TabsTrigger key={p} value={p} title={PROGRAMME_LABELS[p]}>
                  {p}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <p className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Active syllabus</p>
          <div>
            <p className="text-sm font-semibold leading-snug">{syllabus.subject}</p>
            <div className="mt-1 flex gap-1.5">
              <Badge variant="secondary">{syllabus.level}</Badge>
              {syllabus.firstAssessment && <Badge variant="outline">First assessed {syllabus.firstAssessment}</Badge>}
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href="/syllabus">
              <Upload /> Upload subject guide
            </Link>
          </Button>
        </div>
        {/* Re-key so expanded/filter state resets when the programme changes. */}
        <TopicTree key={programme} />
      </aside>
    </>
  );
}
