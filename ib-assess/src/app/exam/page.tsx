import { ComingSoon } from "@/components/workspace/coming-soon";

export default function ExamPage() {
  return (
    <ComingSoon
      title="Exam mode"
      step={4}
      points={[
        "Split screen: stimulus / data booklet / Desmos on the left, question and answer editor on the right",
        "Timer, formula sheet popup, scratchpad",
        "AI grading against the markscheme and a 1–7 grade prediction",
      ]}
    />
  );
}
