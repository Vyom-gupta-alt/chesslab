"use client";

import { useEffect, useRef } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { useDesmos } from "./desmos-provider";
import type { DesmosCalculatorInstance, DesmosNamespace, DesmosState } from "@/types/desmos";
import type { CalculatorKind } from "@/lib/store";
import { cn } from "@/lib/utils";

export const CALCULATOR_FACTORIES: Record<CalculatorKind, keyof DesmosNamespace> = {
  graphing: "GraphingCalculator",
  scientific: "ScientificCalculator",
  geometry: "Geometry",
  "3d": "Calculator3D",
};

export function isCalculatorSupported(Desmos: DesmosNamespace | null, kind: CalculatorKind) {
  return !!Desmos && typeof Desmos[CALCULATOR_FACTORIES[kind]] === "function";
}

/** Exam-friendly defaults: no account features, no external links. */
const DEFAULT_OPTIONS: Record<CalculatorKind, Record<string, unknown>> = {
  graphing: { expressionsCollapsed: false, settingsMenu: true, zoomButtons: true, links: false, border: false },
  scientific: { links: false, border: false },
  geometry: { links: false, border: false },
  "3d": { links: false, border: false },
};

export interface DesmosCalculatorProps {
  kind: CalculatorKind;
  /** State applied once when the calculator is created. */
  initialState?: DesmosState;
  /** Extra Desmos constructor options, merged over the defaults. */
  options?: Record<string, unknown>;
  /** Called with the instance after creation, and with null before it is destroyed. */
  onInstance?: (calc: DesmosCalculatorInstance | null) => void;
  /** Called (debounced) whenever the user changes the calculator. */
  onChange?: (state: DesmosState) => void;
  className?: string;
}

/**
 * Reusable React wrapper around a single Desmos calculator.
 * Requires a <DesmosProvider> ancestor.
 */
export function DesmosCalculator({ kind, initialState, options, onInstance, onChange, className }: DesmosCalculatorProps) {
  const { status, Desmos } = useDesmos();
  const hostRef = useRef<HTMLDivElement>(null);

  // Keep the latest callbacks without re-creating the calculator.
  const cbRef = useRef({ onInstance, onChange, initialState, options });
  cbRef.current = { onInstance, onChange, initialState, options };

  useEffect(() => {
    if (status !== "ready" || !Desmos || !hostRef.current) return;
    const factory = Desmos[CALCULATOR_FACTORIES[kind]] as
      | ((el: HTMLElement, o?: Record<string, unknown>) => DesmosCalculatorInstance)
      | undefined;
    if (typeof factory !== "function") return;

    const { initialState, options } = cbRef.current;
    const calc = factory(hostRef.current, { ...DEFAULT_OPTIONS[kind], ...options });
    if (initialState) {
      try {
        calc.setState(initialState);
      } catch (e) {
        console.warn(`[desmos] could not restore ${kind} state`, e);
      }
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => cbRef.current.onChange?.(calc.getState()), 400);
    };
    calc.observeEvent?.("change", handleChange);
    cbRef.current.onInstance?.(calc);

    // Desmos sizes itself from its container; keep it in sync with panel resizes.
    const ro = new ResizeObserver(() => calc.resize());
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      clearTimeout(timer);
      cbRef.current.onChange?.(calc.getState());
      calc.unobserveEvent?.("change");
      cbRef.current.onInstance?.(null);
      calc.destroy();
    };
  }, [status, Desmos, kind]);

  return (
    <div className={cn("relative h-full w-full", className)}>
      <div ref={hostRef} className="absolute inset-0" />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading Desmos…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Couldn&apos;t load the Desmos API. Check your network connection and NEXT_PUBLIC_DESMOS_API_KEY.
        </div>
      )}
      {status === "ready" && !isCalculatorSupported(Desmos, kind) && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
          This calculator isn&apos;t available with the current Desmos API key.
        </div>
      )}
    </div>
  );
}
