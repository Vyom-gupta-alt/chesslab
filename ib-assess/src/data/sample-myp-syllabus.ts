import type { Syllabus } from "@/types/syllabus";

/**
 * Placeholder MYP syllabus shown before a guide has been uploaded.
 * Abridged from the MYP Mathematics guide (MYP 4–5, standard and extended).
 */
export const SAMPLE_MYP_SYLLABUS: Syllabus = {
  id: "myp-math",
  programme: "MYP",
  subject: "MYP Mathematics (Years 4–5)",
  level: "Standard/Extended",
  firstAssessment: "2021",
  globalContexts: [
    "Identities and relationships",
    "Orientation in space and time",
    "Personal and cultural expression",
    "Scientific and technical innovation",
    "Globalization and sustainability",
    "Fairness and development",
  ],
  keyConcepts: ["Form", "Logic", "Relationships"],
  relatedConcepts: [
    "Change", "Equivalence", "Generalization", "Justification", "Measurement", "Model",
    "Pattern", "Quantity", "Representation", "Simplification", "Space", "System",
  ],
  assessmentObjectives: [
    { code: "A", description: "Knowing and understanding" },
    { code: "B", description: "Investigating patterns" },
    { code: "C", description: "Communicating" },
    { code: "D", description: "Applying mathematics in real-life contexts" },
  ],
  criteria: [
    { code: "A", title: "Knowing and understanding", maxMarks: 8, strands: [
      "i. select appropriate mathematics when solving problems in both familiar and unfamiliar situations",
      "ii. apply the selected mathematics successfully when solving problems",
      "iii. solve problems correctly in a variety of contexts" ] },
    { code: "B", title: "Investigating patterns", maxMarks: 8, strands: [
      "i. select and apply mathematical problem-solving techniques to discover complex patterns",
      "ii. describe patterns as general rules consistent with findings",
      "iii. prove, or verify and justify, general rules" ] },
    { code: "C", title: "Communicating", maxMarks: 8, strands: [
      "i. use appropriate mathematical language in both oral and written explanations",
      "ii. use appropriate forms of mathematical representation to present information",
      "iii. move between different forms of mathematical representation",
      "iv. communicate complete, coherent and concise mathematical lines of reasoning",
      "v. organize information using a logical structure" ] },
    { code: "D", title: "Applying mathematics in real-life contexts", maxMarks: 8, strands: [
      "i. identify relevant elements of authentic real-life situations",
      "ii. select appropriate mathematical strategies when solving authentic real-life situations",
      "iii. apply the selected mathematical strategies successfully to reach a solution",
      "iv. justify the degree of accuracy of a solution",
      "v. justify whether a solution makes sense in the context of the authentic real-life situation" ] },
  ],
  topics: [
    {
      id: "m1", code: "1", title: "Number",
      subtopics: [
        { id: "m1-1", code: "1.1", title: "Number systems and operations", outcomes: [
          { id: "mo1", text: "Operations with real numbers, including surds and fractional indices", commandTerms: ["Calculate", "Use"], level: "Standard" } ] },
        { id: "m1-2", code: "1.2", title: "Standard form and estimation", outcomes: [
          { id: "mo2", text: "Use standard form, rounding, decimal places and significant figures", commandTerms: ["Estimate", "Write down"], level: "Standard" } ] },
        { id: "m1-3", code: "1.3", title: "Logarithms", outcomes: [
          { id: "mo3", text: "Laws of logarithms and solving exponential equations", commandTerms: ["Solve", "Prove"], level: "Extended" } ] },
      ],
    },
    {
      id: "m2", code: "2", title: "Algebra",
      subtopics: [
        { id: "m2-1", code: "2.1", title: "Patterns and sequences", outcomes: [
          { id: "mo4", text: "Find the general rule for linear and quadratic sequences", commandTerms: ["Investigate", "Justify", "Verify"], level: "Standard" } ] },
        { id: "m2-2", code: "2.2", title: "Linear equations and inequalities", outcomes: [
          { id: "mo5", text: "Solve linear equations, inequalities and simultaneous equations", commandTerms: ["Solve", "Graph"], level: "Standard" } ] },
        { id: "m2-3", code: "2.3", title: "Quadratic functions", outcomes: [
          { id: "mo6", text: "Factorise, complete the square and use the quadratic formula; sketch parabolas", commandTerms: ["Sketch", "Solve", "Determine"], level: "Standard" } ] },
        { id: "m2-4", code: "2.4", title: "Functions and transformations", outcomes: [
          { id: "mo7", text: "Domain and range, inverse and composite functions, transformations of graphs", commandTerms: ["Describe", "Sketch"], level: "Extended" } ] },
      ],
    },
    {
      id: "m3", code: "3", title: "Geometry and trigonometry",
      subtopics: [
        { id: "m3-1", code: "3.1", title: "Pythagoras and right-angled trigonometry", outcomes: [
          { id: "mo8", text: "Use Pythagoras' theorem and sine, cosine and tangent ratios", commandTerms: ["Calculate", "Apply"], level: "Standard" } ] },
        { id: "m3-2", code: "3.2", title: "Coordinate geometry", outcomes: [
          { id: "mo9", text: "Gradient, midpoint, distance and the equation of a line", commandTerms: ["Find", "Show"], level: "Standard" } ] },
        { id: "m3-3", code: "3.3", title: "Non-right-angled trigonometry", outcomes: [
          { id: "mo10", text: "Sine rule, cosine rule and area of a triangle", commandTerms: ["Calculate", "Justify"], level: "Extended" } ] },
      ],
    },
    {
      id: "m4", code: "4", title: "Statistics and probability",
      subtopics: [
        { id: "m4-1", code: "4.1", title: "Data representation", outcomes: [
          { id: "mo11", text: "Histograms, box-and-whisker plots and cumulative frequency graphs", commandTerms: ["Construct", "Interpret"], level: "Standard" } ] },
        { id: "m4-2", code: "4.2", title: "Probability", outcomes: [
          { id: "mo12", text: "Venn diagrams, tree diagrams and conditional probability", commandTerms: ["Calculate", "Draw"], level: "Standard" } ] },
        { id: "m4-3", code: "4.3", title: "Bivariate data", outcomes: [
          { id: "mo13", text: "Scatter graphs, lines of best fit and correlation", commandTerms: ["Plot", "Describe", "Predict"], level: "Extended" } ] },
      ],
    },
  ],
};
