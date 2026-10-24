"use client";

import Image from "next/image";
import { LineChart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore, type GraphAttachment } from "@/lib/store";

/** Pull the typed lines out of a Desmos state (used for calculators without screenshots). */
function expressionLines(a: GraphAttachment): string[] {
  const list = (a.state as { expressions?: { list?: { latex?: string }[] } }).expressions?.list ?? [];
  return list.map((e) => e.latex).filter((l): l is string => !!l);
}

/**
 * Student answer box. Graphs inserted from the Desmos panel show up as attachments;
 * each keeps its full Desmos state so it can be reopened and edited.
 * The full LaTeX answer editor arrives with the exam environment (step 4).
 */
export function AnswerBox() {
  const text = useAppStore((s) => s.answerText);
  const attachments = useAppStore((s) => s.attachments);
  const { setAnswerText, removeAttachment, loadIntoCalculator } = useAppStore.getState();

  return (
    <div className="rounded-lg border bg-card">
      <textarea
        value={text}
        onChange={(e) => setAnswerText(e.target.value)}
        placeholder="Type your working here…"
        aria-label="Answer"
        className="min-h-32 w-full resize-y rounded-t-lg bg-transparent p-3 text-sm outline-none"
      />
      <div className="border-t p-3">
        {attachments.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Open the Desmos calculator and press <strong>Insert into answer</strong> to attach a graph.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {attachments.map((a) => (
              <li key={a.id} className="overflow-hidden rounded-md border bg-background">
                {a.image ? (
                  <Image src={a.image} alt={`${a.kind} calculator graph`} width={640} height={420} unoptimized className="h-auto w-full bg-white" />
                ) : (
                  <pre className="max-h-40 overflow-auto bg-muted p-2 text-xs">{expressionLines(a).join("\n") || "(empty)"}</pre>
                )}
                <div className="flex items-center justify-between gap-2 border-t px-2 py-1">
                  <span className="text-xs capitalize text-muted-foreground">
                    {a.kind} · {new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <div className="flex">
                    <Button variant="ghost" size="sm" onClick={() => loadIntoCalculator(a.kind, a.state)}>
                      <LineChart /> Reopen
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Remove attachment" onClick={() => removeAttachment(a.id)}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
