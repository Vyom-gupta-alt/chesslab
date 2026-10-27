import { IB_COMMAND_TERMS, type CommandTerm, type LearningOutcome, type Programme, type Syllabus } from "@/types/syllabus";
import { uid } from "@/lib/utils";

/**
 * Loose syllabus shape produced by both extractors (AI and free mode), before ids are
 * assigned and values are checked against the strict SyllabusSchema.
 */
export interface DraftOutcome {
  text: string;
  commandTerms: string[];
  level?: string | null;
}
export interface DraftSubtopic {
  code: string;
  title: string;
  outcomes: DraftOutcome[];
}
export interface DraftTopic {
  code: string;
  title: string;
  teachingHours?: number | null;
  subtopics: DraftSubtopic[];
}
export interface DraftSyllabus {
  programme: Programme;
  subject: string;
  level?: string | null;
  firstAssessment?: string | null;
  topics: DraftTopic[];
  assessmentObjectives: { code: string; description: string }[];
  criteria: { code: string; title: string; maxMarks: number; strands?: string[] }[];
  keyConcepts?: string[];
  relatedConcepts?: string[];
  globalContexts?: string[];
}

const TERM_BY_LOWER = new Map(IB_COMMAND_TERMS.map((t) => [t.toLowerCase(), t]));

/** Map free-form verbs ("analyze", "sketching") to official command terms, dropping unknowns. */
export function normalizeCommandTerms(terms: string[]): CommandTerm[] {
  const out = new Set<CommandTerm>();
  for (const raw of terms) {
    const t = raw.trim().toLowerCase().replace(/^analyze$/, "analyse").replace(/^organise$/, "organize").replace(/^summarise$/, "summarize");
    const hit = TERM_BY_LOWER.get(t);
    if (hit) out.add(hit);
  }
  return [...out];
}

const DP_LEVELS = ["SL", "HL", "SL/HL"] as const;
const MYP_LEVELS = ["Standard", "Extended", "Standard/Extended"] as const;

function syllabusLevel(programme: Programme, level?: string | null): Syllabus["level"] {
  const l = (level ?? "").toLowerCase();
  if (programme === "MYP") {
    const std = l.includes("standard");
    const ext = l.includes("extended");
    return std && !ext ? MYP_LEVELS[0] : ext && !std ? MYP_LEVELS[1] : MYP_LEVELS[2];
  }
  const sl = /\bsl\b|standard/.test(l);
  const hl = /\ba?hl\b|higher/.test(l);
  return sl && !hl ? DP_LEVELS[0] : hl && !sl ? DP_LEVELS[1] : DP_LEVELS[2];
}

function outcomeLevel(programme: Programme, level?: string | null): LearningOutcome["level"] {
  const l = (level ?? "").toLowerCase();
  if (programme === "MYP") return l.includes("extended") ? "Extended" : "Standard";
  if (l.includes("ahl")) return "AHL";
  if (/\bhl\b|higher/.test(l)) return "HL";
  return "SL";
}

/** Turn a draft into a valid Syllabus with fresh ids. Empty topics/subtopics are dropped. */
export function draftToSyllabus(d: DraftSyllabus): Syllabus {
  const programme = d.programme;
  const topics = d.topics
    .map((t, ti) => ({
      id: uid("t"),
      code: t.code?.trim() || String(ti + 1),
      title: t.title.trim(),
      teachingHours: t.teachingHours ?? undefined,
      subtopics: t.subtopics
        .filter((s) => s.title.trim())
        .map((s, si) => ({
          id: uid("st"),
          code: s.code?.trim() || `${t.code || ti + 1}.${si + 1}`,
          title: s.title.trim(),
          outcomes: s.outcomes
            .filter((o) => o.text.trim())
            .map((o) => ({
              id: uid("o"),
              text: o.text.trim(),
              commandTerms: normalizeCommandTerms(o.commandTerms),
              level: outcomeLevel(programme, o.level),
            })),
        })),
    }))
    .filter((t) => t.title || t.subtopics.length);

  return {
    id: uid("syl"),
    programme,
    subject: d.subject.trim() || "My syllabus",
    level: syllabusLevel(programme, d.level),
    firstAssessment: d.firstAssessment?.trim() || undefined,
    topics,
    assessmentObjectives: d.assessmentObjectives.filter((a) => a.code && a.description),
    criteria: d.criteria
      .filter((c) => c.code && c.title)
      .map((c) => ({ ...c, maxMarks: Number(c.maxMarks) || (programme === "MYP" ? 8 : 0), strands: c.strands?.length ? c.strands : undefined })),
    keyConcepts: d.keyConcepts?.length ? d.keyConcepts : undefined,
    relatedConcepts: d.relatedConcepts?.length ? d.relatedConcepts : undefined,
    globalContexts: d.globalContexts?.length ? d.globalContexts : undefined,
  };
}

/**
 * Merge `incoming` into `base` (e.g. a second batch of screenshots of the same guide).
 * Topics and subtopics are matched by code, then by title; new outcomes are appended.
 */
export function mergeSyllabi(base: Syllabus, incoming: Syllabus): Syllabus {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const topics = base.topics.map((t) => ({ ...t, subtopics: t.subtopics.map((s) => ({ ...s, outcomes: [...s.outcomes] })) }));

  for (const it of incoming.topics) {
    const t = topics.find((x) => x.code === it.code || norm(x.title) === norm(it.title));
    if (!t) {
      topics.push(it);
      continue;
    }
    if (/^topic \d+$/i.test(t.title) && it.title) t.title = it.title;
    for (const is of it.subtopics) {
      const s = t.subtopics.find((x) => x.code === is.code || norm(x.title) === norm(is.title));
      if (!s) {
        t.subtopics.push(is);
        continue;
      }
      for (const o of is.outcomes) if (!s.outcomes.some((x) => norm(x.text) === norm(o.text))) s.outcomes.push(o);
    }
  }
  const byCode = <T extends { code: string }>(a: T[], b: T[]) => [...a, ...b.filter((x) => !a.some((y) => y.code === x.code))];
  const uniq = (a?: string[], b?: string[]) => {
    const all = [...new Set([...(a ?? []), ...(b ?? [])])];
    return all.length ? all : undefined;
  };

  return {
    ...base,
    subject: /^my syllabus$/i.test(base.subject) ? incoming.subject : base.subject,
    topics: topics.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    assessmentObjectives: byCode(base.assessmentObjectives, incoming.assessmentObjectives),
    criteria: byCode(base.criteria, incoming.criteria),
    keyConcepts: uniq(base.keyConcepts, incoming.keyConcepts),
    relatedConcepts: uniq(base.relatedConcepts, incoming.relatedConcepts),
    globalContexts: uniq(base.globalContexts, incoming.globalContexts),
  };
}
