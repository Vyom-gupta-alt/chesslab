import { ComingSoon } from "@/components/workspace/coming-soon";

export default function SyllabusPage() {
  return (
    <ComingSoon
      title="Syllabus ingestion"
      step={3}
      points={[
        "Upload a subject guide PDF or paste curriculum text",
        "Claude extracts topics, subtopics, outcomes, AOs, command terms and criteria into the Zod SyllabusSchema",
        "Review and edit the tree before making it the active syllabus",
      ]}
    />
  );
}
