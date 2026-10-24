"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Programme, Syllabus } from "@/types/syllabus";
import type { DesmosState } from "@/types/desmos";
import { SAMPLE_DP_SYLLABUS } from "@/data/sample-syllabus";
import { SAMPLE_MYP_SYLLABUS } from "@/data/sample-myp-syllabus";
import { uid } from "@/lib/utils";

/** localStorage that never throws (private mode, quota exceeded by screenshots, SSR). */
const safeStorage = {
  getItem: (k: string) => {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  setItem: (k: string, v: string) => {
    try { localStorage.setItem(k, v); } catch (e) { console.warn("[ib-assess] could not persist state", e); }
  },
  removeItem: (k: string) => {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  },
};

export type CalculatorKind = "graphing" | "scientific" | "geometry" | "3d";

/** A graph captured from Desmos and attached to a student's answer. */
export interface GraphAttachment {
  id: string;
  kind: CalculatorKind;
  /** PNG data URL (absent for calculators without screenshot support). */
  image?: string;
  /** Full Desmos state so the graph can be reopened and edited. */
  state: DesmosState;
  createdAt: number;
}

interface AppState {
  // Layout
  sidebarOpen: boolean;
  toggleSidebar: () => void;

  // Calculator panel
  calculatorOpen: boolean;
  calculatorKind: CalculatorKind;
  calculatorWide: boolean;
  setCalculatorOpen: (open: boolean) => void;
  toggleCalculator: (kind?: CalculatorKind) => void;
  setCalculatorKind: (kind: CalculatorKind) => void;
  toggleCalculatorWide: () => void;

  /** Saved Desmos state per calculator, restored when the calculator mounts. */
  calculatorStates: Partial<Record<CalculatorKind, DesmosState>>;
  saveCalculatorState: (kind: CalculatorKind, state: DesmosState) => void;
  /** Pending state to load into a calculator (e.g. reopening an attachment). */
  pendingLoad: { kind: CalculatorKind; state: DesmosState; nonce: number } | null;
  loadIntoCalculator: (kind: CalculatorKind, state: DesmosState) => void;
  clearPendingLoad: () => void;

  // Programme & syllabus (one active syllabus per programme)
  programme: Programme;
  setProgramme: (p: Programme) => void;
  syllabi: Record<Programme, Syllabus>;
  selectedSubtopicId: string | null;
  /** Stores the syllabus under its own programme and switches to it. */
  setSyllabus: (s: Syllabus) => void;
  selectSubtopic: (id: string | null) => void;

  // Answer box (placeholder until the exam environment exists)
  answerText: string;
  attachments: GraphAttachment[];
  setAnswerText: (t: string) => void;
  addAttachment: (a: Omit<GraphAttachment, "id" | "createdAt">) => void;
  removeAttachment: (id: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      calculatorOpen: false,
      calculatorKind: "graphing",
      calculatorWide: false,
      setCalculatorOpen: (open) => set({ calculatorOpen: open }),
      toggleCalculator: (kind) =>
        set((s) => {
          if (kind && kind !== s.calculatorKind) return { calculatorOpen: true, calculatorKind: kind };
          return { calculatorOpen: !s.calculatorOpen };
        }),
      setCalculatorKind: (kind) => set({ calculatorKind: kind }),
      toggleCalculatorWide: () => set((s) => ({ calculatorWide: !s.calculatorWide })),

      calculatorStates: {},
      saveCalculatorState: (kind, state) =>
        set((s) => ({ calculatorStates: { ...s.calculatorStates, [kind]: state } })),
      pendingLoad: null,
      loadIntoCalculator: (kind, state) =>
        set({ pendingLoad: { kind, state, nonce: Date.now() }, calculatorOpen: true, calculatorKind: kind }),
      clearPendingLoad: () => set({ pendingLoad: null }),

      programme: "DP",
      setProgramme: (programme) => set({ programme, selectedSubtopicId: null }),
      syllabi: { DP: SAMPLE_DP_SYLLABUS, MYP: SAMPLE_MYP_SYLLABUS },
      selectedSubtopicId: null,
      setSyllabus: (syllabus) =>
        set((s) => ({
          syllabi: { ...s.syllabi, [syllabus.programme]: syllabus },
          programme: syllabus.programme,
          selectedSubtopicId: null,
        })),
      selectSubtopic: (id) => set({ selectedSubtopicId: id }),

      answerText: "",
      attachments: [],
      setAnswerText: (answerText) => set({ answerText }),
      addAttachment: (a) =>
        set((s) => ({ attachments: [...s.attachments, { ...a, id: uid("graph"), createdAt: Date.now() }] })),
      removeAttachment: (id) => set((s) => ({ attachments: s.attachments.filter((a) => a.id !== id) })),
    }),
    {
      name: "ib-assess",
      version: 2,
      // v1 stored a single DP `syllabus`; v2 keeps one per programme.
      migrate: (persisted, version) => {
        const old = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          const { syllabus, ...rest } = old as { syllabus?: Syllabus };
          const dp = syllabus ? { ...syllabus, programme: "DP" as const } : SAMPLE_DP_SYLLABUS;
          return { ...rest, programme: "DP", syllabi: { DP: dp, MYP: SAMPLE_MYP_SYLLABUS } };
        }
        return old;
      },
      storage: createJSONStorage(() => safeStorage),
      // Rehydrated manually in <AppShell> after mount so SSR markup matches the first client render.
      skipHydration: true,
      // Transient UI state (open panels, pending loads) is not persisted.
      partialize: (s) => ({
        sidebarOpen: s.sidebarOpen,
        calculatorKind: s.calculatorKind,
        calculatorWide: s.calculatorWide,
        calculatorStates: s.calculatorStates,
        programme: s.programme,
        syllabi: s.syllabi,
        answerText: s.answerText,
        attachments: s.attachments,
      }),
    },
  ),
);

/** The syllabus for the currently selected programme. */
export const useActiveSyllabus = () => useAppStore((s) => s.syllabi[s.programme]);
