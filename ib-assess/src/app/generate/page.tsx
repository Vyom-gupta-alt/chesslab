import { ComingSoon } from "@/components/workspace/coming-soon";

export default function GeneratePage() {
  return (
    <ComingSoon
      title="Paper generator"
      step={4}
      points={[
        "DP: choose subject, paper type (1/2/3, sections A–C), difficulty and target topics",
        "MYP: on-screen eAssessment-style tasks targeting criteria A–D, with key concepts and a global context",
        "MCQ with distractor analysis, short answer / data-based, extended response with criteria",
        "KaTeX rendering and markschemes with [1 mark] partial-credit breakdowns",
      ]}
    />
  );
}
