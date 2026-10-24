import type { Syllabus } from "@/types/syllabus";

/**
 * Placeholder syllabus shown before a guide has been uploaded.
 * Abridged from the IB Mathematics: Analysis & Approaches guide (first assessment 2021).
 */
export const SAMPLE_DP_SYLLABUS: Syllabus = {
  id: "math-aa",
  programme: "DP",
  subject: "Mathematics: Analysis and Approaches",
  level: "SL/HL",
  firstAssessment: "2021",
  assessmentObjectives: [
    { code: "AO1", description: "Knowledge and understanding" },
    { code: "AO2", description: "Problem solving" },
    { code: "AO3", description: "Communication and interpretation" },
    { code: "AO4", description: "Technology" },
    { code: "AO5", description: "Reasoning" },
    { code: "AO6", description: "Inquiry approaches" },
  ],
  criteria: [
    { code: "A", title: "Presentation", maxMarks: 4 },
    { code: "B", title: "Mathematical communication", maxMarks: 4 },
    { code: "C", title: "Personal engagement", maxMarks: 3 },
    { code: "D", title: "Reflection", maxMarks: 3 },
    { code: "E", title: "Use of mathematics", maxMarks: 6 },
  ],
  topics: [
    {
      id: "t1", code: "1", title: "Number and algebra", teachingHours: 19,
      subtopics: [
        { id: "t1-1", code: "1.1", title: "Scientific notation", outcomes: [
          { id: "o1", text: "Operations with numbers in the form a × 10^k", commandTerms: ["Calculate", "Write down"], level: "SL" } ] },
        { id: "t1-2", code: "1.2", title: "Arithmetic sequences and series", outcomes: [
          { id: "o2", text: "Use the formulae for the nth term and sum of an arithmetic sequence", commandTerms: ["Find", "Calculate"], level: "SL" } ] },
        { id: "t1-3", code: "1.3", title: "Geometric sequences and series", outcomes: [
          { id: "o3", text: "Use the formulae for the nth term and sum of a geometric sequence", commandTerms: ["Find", "Show that"], level: "SL" } ] },
        { id: "t1-9", code: "1.9", title: "Binomial theorem", outcomes: [
          { id: "o4", text: "Expansion of (a + b)^n, n ∈ ℕ", commandTerms: ["Determine", "Find"], level: "SL" } ] },
      ],
    },
    {
      id: "t2", code: "2", title: "Functions", teachingHours: 21,
      subtopics: [
        { id: "t2-1", code: "2.1", title: "Equations of straight lines", outcomes: [
          { id: "o5", text: "Different forms of the equation of a straight line", commandTerms: ["Write down", "Find"], level: "SL" } ] },
        { id: "t2-6", code: "2.6", title: "Quadratic functions", outcomes: [
          { id: "o6", text: "The quadratic function f(x) = ax² + bx + c: its graph, y-intercept and axis of symmetry", commandTerms: ["Sketch", "Graph", "Determine"], level: "SL" } ] },
        { id: "t2-9", code: "2.9", title: "Exponential and logarithmic functions", outcomes: [
          { id: "o7", text: "Graphs of exponential and logarithmic functions", commandTerms: ["Sketch", "Solve"], level: "SL" } ] },
      ],
    },
    {
      id: "t3", code: "3", title: "Geometry and trigonometry", teachingHours: 25,
      subtopics: [
        { id: "t3-2", code: "3.2", title: "Right-angled trigonometry", outcomes: [
          { id: "o8", text: "Use of sine, cosine and tangent ratios", commandTerms: ["Calculate"], level: "SL" } ] },
        { id: "t3-7", code: "3.7", title: "Circular functions", outcomes: [
          { id: "o9", text: "The circular functions sin x, cos x and tan x: amplitude, period and transformations", commandTerms: ["Sketch", "Annotate"], level: "SL" } ] },
      ],
    },
    {
      id: "t4", code: "4", title: "Statistics and probability", teachingHours: 27,
      subtopics: [
        { id: "t4-4", code: "4.4", title: "Linear correlation of bivariate data", outcomes: [
          { id: "o10", text: "Pearson's product-moment correlation coefficient r", commandTerms: ["Calculate", "Interpret"], level: "SL" } ] },
        { id: "t4-9", code: "4.9", title: "The normal distribution", outcomes: [
          { id: "o11", text: "Properties of the normal distribution and normal probability calculations", commandTerms: ["Calculate", "Sketch"], level: "SL" } ] },
      ],
    },
    {
      id: "t5", code: "5", title: "Calculus", teachingHours: 28,
      subtopics: [
        { id: "t5-1", code: "5.1", title: "Introduction to limits and derivatives", outcomes: [
          { id: "o12", text: "The derivative interpreted as gradient function and rate of change", commandTerms: ["Explain", "Estimate"], level: "SL" } ] },
        { id: "t5-6", code: "5.6", title: "Differentiation rules", outcomes: [
          { id: "o13", text: "Chain rule, product and quotient rules", commandTerms: ["Differentiate", "Find"], level: "SL" } ] },
        { id: "t5-11", code: "5.11", title: "Definite integrals and areas", outcomes: [
          { id: "o14", text: "Areas between a curve and the x-axis", commandTerms: ["Integrate", "Evaluate"], level: "SL" } ] },
      ],
    },
  ],
};
