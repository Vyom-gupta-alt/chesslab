import { ComingSoon } from "@/components/workspace/coming-soon";

export default function ExamPage() {
  return (
    <ComingSoon
      title="Exam mode"
      step={4}
      points={[
        "Split screen: stimulus / data booklet / Desmos on the left, question and answer editor on the right",
        "Timer, formula sheet popup, scratchpad",
        "DP: AI grading against the markscheme and a 1–7 grade prediction from percentage boundaries",
        "MYP: AI levels 0–8 per criterion (A–D), summed out of 32 and converted to a 1–7 grade",
      ]}
    />
  );
}
