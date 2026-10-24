import { z } from "zod";

export const PROGRAMMES = ["DP", "MYP"] as const;
export const ProgrammeSchema = z.enum(PROGRAMMES);
export type Programme = z.infer<typeof ProgrammeSchema>;

/**
 * IB command terms used across the DP and MYP subject guides.
 * Every generated question must carry at least one.
 */
export const IB_COMMAND_TERMS = [
  "Analyse", "Annotate", "Apply", "Calculate", "Classify", "Comment", "Compare",
  "Compare and contrast", "Construct", "Contrast", "Create", "Deduce", "Define", "Demonstrate",
  "Derive", "Describe", "Design", "Determine", "Differentiate", "Discuss", "Distinguish", "Draw",
  "Estimate", "Evaluate", "Explain", "Find", "Formulate", "Graph", "Hence", "Identify",
  "Integrate", "Interpret", "Investigate", "Justify", "Label", "List", "Measure", "Organize",
  "Outline", "Plot", "Predict", "Present", "Prove", "Select", "Show", "Show that", "Sketch",
  "Solve", "State", "Suggest", "Summarize", "Synthesize", "Test", "Trace", "Use", "Verify",
  "Write down",
] as const;
export const CommandTermSchema = z.enum(IB_COMMAND_TERMS);
export type CommandTerm = z.infer<typeof CommandTermSchema>;

export const AssessmentObjectiveSchema = z.object({
  code: z.string().describe("e.g. AO1"),
  description: z.string(),
});

export const LearningOutcomeSchema = z.object({
  id: z.string(),
  text: z.string(),
  commandTerms: z.array(CommandTermSchema).default([]),
  /** DP: SL / HL / AHL. MYP: Standard / Extended (MYP 4–5 mathematics). */
  level: z.enum(["SL", "HL", "AHL", "Standard", "Extended"]).default("SL"),
});

export const SubtopicSchema = z.object({
  id: z.string(),
  code: z.string().describe("syllabus reference, e.g. 1.2"),
  title: z.string(),
  outcomes: z.array(LearningOutcomeSchema).default([]),
});

export const TopicSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  teachingHours: z.number().optional(),
  subtopics: z.array(SubtopicSchema).default([]),
});

export const AssessmentCriterionSchema = z.object({
  code: z.string().describe("e.g. A"),
  title: z.string(),
  maxMarks: z.number(),
  /** MYP strands, e.g. "i. select appropriate mathematics…" */
  strands: z.array(z.string()).optional(),
});

export const SyllabusSchema = z.object({
  id: z.string(),
  programme: ProgrammeSchema,
  subject: z.string(),
  level: z.enum(["SL", "HL", "SL/HL", "Standard", "Extended", "Standard/Extended"]),
  firstAssessment: z.string().optional(),
  /** MYP only: the six global contexts, key and related concepts in the unit planner. */
  globalContexts: z.array(z.string()).optional(),
  keyConcepts: z.array(z.string()).optional(),
  relatedConcepts: z.array(z.string()).optional(),
  topics: z.array(TopicSchema),
  assessmentObjectives: z.array(AssessmentObjectiveSchema).default([]),
  criteria: z.array(AssessmentCriterionSchema).default([]),
});

export type LearningOutcome = z.infer<typeof LearningOutcomeSchema>;
export type Subtopic = z.infer<typeof SubtopicSchema>;
export type Topic = z.infer<typeof TopicSchema>;
export type Syllabus = z.infer<typeof SyllabusSchema>;
