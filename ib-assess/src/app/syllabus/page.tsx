"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { IngestPanel } from "@/components/syllabus/ingest-panel";
import { SyllabusEditor } from "@/components/syllabus/syllabus-editor";
import { mergeSyllabi } from "@/lib/ingest/draft";
import { useAppStore } from "@/lib/store";
import type { Syllabus } from "@/types/syllabus";

export default function SyllabusPage() {
  const router = useRouter();
  const syllabi = useAppStore((s) => s.syllabi);
  const setSyllabus = useAppStore((s) => s.setSyllabus);
  const [result, setResult] = useState<{ syllabus: Syllabus; note?: string; key: number } | null>(null);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Upload your syllabus</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Screenshots, phone photos, the subject guide PDF or pasted text. DP and MYP are detected automatically.
        </p>
      </div>

      {result ? (
        <>
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Read. Check it over, then save.
          </p>
          <SyllabusEditor
            key={result.key}
            initial={result.syllabus}
            note={result.note}
            existing={syllabi}
            onCancel={() => setResult(null)}
            onSave={(s, { merge }) => {
              const current = syllabi[s.programme];
              setSyllabus(merge && current ? mergeSyllabi(current, s) : s);
              router.push("/");
            }}
          />
        </>
      ) : (
        <IngestPanel onExtracted={(syllabus, note) => setResult({ syllabus, note, key: Date.now() })} />
      )}
    </div>
  );
}
