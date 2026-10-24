import Link from "next/link";
import { ArrowRight, FileText, Timer, Upload } from "lucide-react";
import { SubtopicDetail } from "@/components/workspace/subtopic-detail";
import { AnswerBox } from "@/components/workspace/answer-box";
import { CriteriaCard } from "@/components/workspace/criteria-card";

const ACTIONS = [
  { href: "/syllabus", icon: Upload, title: "Ingest a subject guide", body: "Upload a syllabus PDF or paste text to build the topic tree." },
  { href: "/generate", icon: FileText, title: "Generate a paper", body: "DP Papers 1–3 or MYP eAssessment-style tasks, mapped to topics and command terms." },
  { href: "/exam", icon: Timer, title: "Exam mode", body: "Timed split-screen test with Desmos, formula sheet and auto-grading (DP 1–7 or MYP criteria A–D)." },
];

export default function WorkspacePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <section>
        <h1 className="text-2xl font-semibold">Workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick DP or MYP in the sidebar, browse the syllabus, then practise with Desmos open beside you.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {ACTIONS.map(({ href, icon: Icon, title, body }) => (
          <Link key={href} href={href} className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/40">
            <Icon className="h-5 w-5 text-primary" />
            <p className="mt-3 flex items-center gap-1 font-medium">
              {title} <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </Link>
        ))}
      </section>

      <section>
        <SubtopicDetail />
      </section>

      <section>
        <CriteriaCard />
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Scratch answer</h2>
        <p className="text-sm text-muted-foreground">
          Sketch something in the graphing calculator (Alt+G), then insert it here.
        </p>
        <AnswerBox />
      </section>
    </div>
  );
}
