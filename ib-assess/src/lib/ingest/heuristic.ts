import { IB_COMMAND_TERMS, type Programme } from "@/types/syllabus";
import type { DraftSubtopic, DraftSyllabus, DraftTopic } from "./draft";

/**
 * Free-mode parser: turns raw text (pasted, from a PDF, or from OCR of a screenshot)
 * into a draft syllabus using the numbering conventions of IB guides:
 *   "Topic 1: Number and algebra" / "1 Number and algebra"   → topic
 *   "SL 1.2 Arithmetic sequences" / "1.2 Arithmetic sequences" → subtopic
 *   bullets and sentences underneath                          → learning outcomes
 *   "Criterion A: Knowing and understanding (8)"              → criterion
 * It is deliberately forgiving; the review step lets the user fix anything it gets wrong.
 */

// Includes characters OCR commonly reads bullets as («, ©, °, ¢).
const BULLET = /^[\s]*(?:[•●◦▪▫■□‣⁃∙·*–—«»©°¢-]|o(?=\s)|\(?[a-z]\)|\(?[ivx]+\))\s*/i;
const TOPIC = /^(?:topic|unit|chapter|theme|strand|section)?\s*(\d{1,2})\s*[:.)\-–—]?\s+([A-Za-z(][^]{2,})$/i;
const TOPIC_WORD = /^(?:topic|unit|chapter|theme|strand|section)\s+(\d{1,2}|[A-E])\b\s*[:.)\-–—]?\s*(.*)$/i;
/** "1.2 …", "SL 1.2 …", "AHL 3.10 …", and letter-numbered science themes ("A.1 …"). */
const SUBTOPIC = /^(?:(SL|HL|AHL)\s*)?(\d{1,2}|[A-E])\.(\d{1,2})(?:\.\d+)?\s*[:.)\-–—]?\s*(.*)$/;
const CONCEPTS = /^(key concepts?|related concepts?|global contexts?)\s*[:\-–—]\s*(.+)$/i;
const CRITERION = /^criterion\s+([A-F])\s*[:.)\-–—]?\s*(.+)$/i;
const AO = /^(AO\d)\s*[:.)\-–—]?\s*(.+)$/i;
const NOISE = /^(?:page\s*\d+|\d+|©.*|syllabus content|contents|international baccalaureate.*|subject guide.*)$/i;

/** Command terms obvious enough to tag even when written in lower case mid-sentence. */
const STRONG_TERMS = new Set([
  "analyse", "annotate", "calculate", "deduce", "derive", "differentiate", "discuss", "estimate",
  "evaluate", "explain", "integrate", "interpret", "investigate", "justify", "sketch", "solve",
  "prove", "verify", "construct", "compare", "contrast", "describe", "determine", "predict",
]);

export function detectCommandTerms(text: string): string[] {
  const found = new Set<string>();
  const first = text.trim().split(/[\s,:;]+/)[0]?.toLowerCase() ?? "";
  for (const term of IB_COMMAND_TERMS) {
    const lower = term.toLowerCase();
    if (first === lower || first === lower.replace("analyse", "analyze")) found.add(term);
    const re = new RegExp(`\\b${lower.replace(/ /g, "\\s+")}\\b`, "i");
    const m = text.match(re);
    if (!m) continue;
    // Capitalised mid-sentence use ("…then Sketch the graph") or an unambiguous verb.
    if (m[0][0] === m[0][0].toUpperCase() || STRONG_TERMS.has(lower)) found.add(term);
  }
  return [...found];
}

function detectProgramme(text: string): Programme {
  return /\bMYP\b|middle years|global contexts?|key concepts?|related concepts?|\bextended\b.*\bmathematics\b/i.test(text)
    ? "MYP"
    : "DP";
}

function detectSubject(lines: string[]): string {
  const subjects =
    /mathematics|analysis and approaches|applications and interpretation|physics|chemistry|biology|sciences?|economics|business|history|geography|psychology|english|language|literature|design|computer science|individuals and societies|arts|music|visual arts|physical and health/i;
  const hit = lines.slice(0, 40).find((l) => subjects.test(l) && l.length < 90 && !SUBTOPIC.test(l));
  return hit?.replace(/\s*(subject )?guide\b.*$/i, "").replace(/\s*[—–-]\s*$/, "").trim() || "My syllabus";
}

function looksLikeTitle(line: string) {
  return line.length <= 70 && !/[.;:]$/.test(line) && /^[A-Z]/.test(line) && line.split(/\s+/).length <= 9;
}

export function parseSyllabusText(raw: string): DraftSyllabus {
  const programme = detectProgramme(raw);
  const lines = raw
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 2 && !NOISE.test(l));

  const topics: DraftTopic[] = [];
  const criteria: DraftSyllabus["criteria"] = [];
  const aos: DraftSyllabus["assessmentObjectives"] = [];
  let topic: DraftTopic | null = null;
  let sub: DraftSubtopic | null = null;
  let lastOutcome: { text: string } | null = null;
  let crit: DraftSyllabus["criteria"][number] | null = null;
  let subLevel: string | null = null;
  const levelHints = new Set<string>();
  const concepts: Record<"key" | "related" | "global", string[]> = { key: [], related: [], global: [] };

  const getTopic = (code: string, title?: string) => {
    let t = topics.find((x) => x.code === code);
    if (!t) {
      t = { code, title: title || `Topic ${code}`, subtopics: [] };
      topics.push(t);
    } else if (title && /^topic \d+$/i.test(t.title)) t.title = title;
    return t;
  };

  for (const line of lines) {
    if (/\b(SL|HL|AHL)\b/.test(line)) line.match(/\b(SL|HL|AHL)\b/g)!.forEach((m) => levelHints.add(m));
    if (/\bstandard\b/i.test(line)) levelHints.add("Standard");
    if (/\bextended\b/i.test(line)) levelHints.add("Extended");

    let m: RegExpMatchArray | null;
    if ((m = line.match(CONCEPTS))) {
      const kind = m[1].toLowerCase().startsWith("key") ? "key" : m[1].toLowerCase().startsWith("related") ? "related" : "global";
      concepts[kind].push(...m[2].split(/[,;•]/).map((x) => x.trim()).filter(Boolean));
      continue;
    }
    if ((m = line.match(CRITERION))) {
      const marks = m[2].match(/\(?\s*(?:max(?:imum)?\s*)?(\d{1,2})\s*(?:marks?)?\s*\)?\s*$/i);
      crit = {
        code: m[1].toUpperCase(),
        title: m[2].replace(/\(?\s*(?:max(?:imum)?\s*)?\d{1,2}\s*(?:marks?)?\s*\)?\s*$/i, "").replace(/[:.\s]+$/, "").trim(),
        maxMarks: marks ? Number(marks[1]) : programme === "MYP" ? 8 : 0,
        strands: [],
      };
      if (!criteria.some((c) => c.code === crit!.code)) criteria.push(crit);
      sub = null;
      lastOutcome = null;
      continue;
    }
    if ((m = line.match(AO))) {
      aos.push({ code: m[1].toUpperCase(), description: m[2] });
      crit = null;
      continue;
    }
    if ((m = line.match(SUBTOPIC)) && (m[4] || "").length > 1) {
      topic = getTopic(m[2].toUpperCase());
      const code = `${m[2].toUpperCase()}.${m[3]}`;
      sub = topic.subtopics.find((s) => s.code === code) ?? null;
      if (!sub) {
        sub = { code, title: m[4], outcomes: [] };
        topic.subtopics.push(sub);
      }
      subLevel = m[1]?.toUpperCase() ?? null;
      crit = null;
      lastOutcome = null;
      continue;
    }
    if ((m = line.match(TOPIC_WORD)) || ((m = line.match(TOPIC)) && looksLikeTitle(m[2]))) {
      topic = getTopic(m[1].toUpperCase(), m[2]?.trim() || undefined);
      sub = null;
      subLevel = null;
      crit = null;
      lastOutcome = null;
      continue;
    }

    const bullet = BULLET.test(line);
    const text = line.replace(BULLET, "").trim();
    if (!text) continue;

    if (crit && (bullet || /^[ivx]+\.\s/i.test(line))) {
      crit.strands!.push(text);
      continue;
    }
    // Continuation of a sentence the PDF/OCR wrapped onto a new line.
    if (lastOutcome && !bullet && /^[a-z(,]/.test(text)) {
      lastOutcome.text += ` ${text}`;
      continue;
    }
    if (!topic) continue;
    if (!sub) {
      if (!bullet && looksLikeTitle(text)) {
        sub = { code: `${topic.code}.${topic.subtopics.length + 1}`, title: text, outcomes: [] };
        topic.subtopics.push(sub);
        lastOutcome = null;
        continue;
      }
      sub = { code: `${topic.code}.${topic.subtopics.length + 1}`, title: "Overview", outcomes: [] };
      topic.subtopics.push(sub);
    }
    const outcome = { text, commandTerms: [] as string[], level: subLevel };
    sub.outcomes.push(outcome);
    lastOutcome = outcome;
  }

  for (const t of topics)
    for (const s of t.subtopics) for (const o of s.outcomes) o.commandTerms = detectCommandTerms(o.text);

  const level =
    programme === "MYP"
      ? [...levelHints].filter((l) => l === "Standard" || l === "Extended").join("/")
      : [...levelHints].filter((l) => l !== "Standard" && l !== "Extended").join("/");

  return {
    programme,
    subject: detectSubject(lines),
    level,
    topics: topics.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    assessmentObjectives: aos,
    criteria: criteria.map((c) => ({ ...c, strands: c.strands?.length ? c.strands : undefined })),
    keyConcepts: concepts.key,
    relatedConcepts: concepts.related,
    globalContexts: concepts.global,
  };
}
