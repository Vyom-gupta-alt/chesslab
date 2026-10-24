import { z } from "zod";

/** Official IB command terms. Every generated question must carry at least one. */
export const IB_COMMAND_TERMS = [
  "Annotate", "Calculate", "Comment", "Compare", "Compare and contrast", "Construct",
  "Contrast", "Deduce", "Define", "Demonstrate", "Describe", "Determine", "Differentiate",
  "Discuss", "Distinguish", "Draw", "Estimate", "Evaluate", "Explain", "Find", "Graph",
  "Hence", "Identify", "Integrate", "Interpret", "Investigate", "Justify", "Label", "List",
  "Outline", "Plot", "Predict", "Prove", "Show", "Show that", "Sketch", "Solve", "State",
  "Suggest", "Verify", "Write down",
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
  level: z.enum(["SL", "HL", "AHL"]).default("SL"),
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
  code: z.string().describe("e.g. Criterion A"),
  title: z.string(),
  maxMarks: z.number(),
});

export const SyllabusSchema = z.object({
  id: z.string(),
  subject: z.string(),
  level: z.enum(["SL", "HL", "SL/HL"]),
  firstAssessment: z.string().optional(),
  topics: z.array(TopicSchema),
  assessmentObjectives: z.array(AssessmentObjectiveSchema).default([]),
  criteria: z.array(AssessmentCriterionSchema).default([]),
});

export type LearningOutcome = z.infer<typeof LearningOutcomeSchema>;
export type Subtopic = z.infer<typeof SubtopicSchema>;
export type Topic = z.infer<typeof TopicSchema>;
export type Syllabus = z.infer<typeof SyllabusSchema>;
