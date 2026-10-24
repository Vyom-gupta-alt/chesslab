import type { Programme } from "@/types/syllabus";

/**
 * MYP: final grade from the sum of the four criterion levels (A–D, each 0–8, total /32).
 * Published IB MYP boundaries.
 */
export const MYP_GRADE_BOUNDARIES: { grade: number; min: number; max: number }[] = [
  { grade: 1, min: 1, max: 5 },
  { grade: 2, min: 6, max: 9 },
  { grade: 3, min: 10, max: 14 },
  { grade: 4, min: 15, max: 18 },
  { grade: 5, min: 19, max: 23 },
  { grade: 6, min: 24, max: 27 },
  { grade: 7, min: 28, max: 32 },
];

/**
 * DP: approximate percentage boundaries. Real boundaries change per subject and session,
 * so these are only for practice-grade prediction.
 */
export const DP_GRADE_BOUNDARIES: { grade: number; minPercent: number }[] = [
  { grade: 7, minPercent: 80 },
  { grade: 6, minPercent: 68 },
  { grade: 5, minPercent: 56 },
  { grade: 4, minPercent: 44 },
  { grade: 3, minPercent: 32 },
  { grade: 2, minPercent: 18 },
  { grade: 1, minPercent: 0 },
];

/** MYP grade (0–7) from criterion levels, e.g. { A: 6, B: 5, C: 7, D: 4 }. */
export function mypGrade(levels: Record<string, number>): number {
  const total = Object.values(levels).reduce((a, b) => a + Math.max(0, Math.min(8, b)), 0);
  return MYP_GRADE_BOUNDARIES.find((b) => total >= b.min && total <= b.max)?.grade ?? 0;
}

/** DP grade (1–7) from a percentage score. */
export function dpGrade(percent: number): number {
  return DP_GRADE_BOUNDARIES.find((b) => percent >= b.minPercent)?.grade ?? 1;
}

export const PROGRAMME_LABELS: Record<Programme, string> = {
  DP: "Diploma Programme",
  MYP: "Middle Years Programme",
};
