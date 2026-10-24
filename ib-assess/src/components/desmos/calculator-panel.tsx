"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Box, Calculator, Check, ImagePlus, LineChart, Maximize2, Minimize2, RotateCcw, Shapes, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DesmosCalculator, isCalculatorSupported } from "./desmos-calculator";
import { useDesmos } from "./desmos-provider";
import { useAppStore, type CalculatorKind } from "@/lib/store";
import type { DesmosCalculatorInstance } from "@/types/desmos";
import { cn } from "@/lib/utils";

const KINDS: { kind: CalculatorKind; label: string; icon: typeof LineChart }[] = [
  { kind: "graphing", label: "Graphing", icon: LineChart },
  { kind: "scientific", label: "Scientific", icon: Calculator },
  { kind: "geometry", label: "Geometry", icon: Shapes },
  { kind: "3d", label: "3D", icon: Box },
];

/** Screenshot size for answer attachments; kept small so localStorage doesn't fill up. */
const SHOT = { width: 640, height: 420, targetPixelRatio: 1 } as const;

/**
 * Non-modal slide-over holding the Desmos calculators. It stays mounted while closed so
 * calculators keep their state, and only creates a calculator the first time its tab is opened.
 */
export function CalculatorPanel() {
  const { Desmos, status } = useDesmos();
  const open = useAppStore((s) => s.calculatorOpen);
  const kind = useAppStore((s) => s.calculatorKind);
  const wide = useAppStore((s) => s.calculatorWide);
  const states = useAppStore((s) => s.calculatorStates);
  const pendingLoad = useAppStore((s) => s.pendingLoad);
  const { setCalculatorOpen, setCalculatorKind, toggleCalculatorWide, saveCalculatorState, addAttachment, clearPendingLoad } =
    useAppStore.getState();

  const instances = useRef<Partial<Record<CalculatorKind, DesmosCalculatorInstance>>>({});
  const [, forceRender] = useState(0);
  const [visited, setVisited] = useState<Set<CalculatorKind>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);

  // Mount a calculator the first time its tab is shown while the panel is open.
  useEffect(() => {
    if (open && !visited.has(kind)) setVisited((v) => new Set(v).add(kind));
  }, [open, kind, visited]);

  // Hidden calculators measure 0×0; resize when shown again.
  useEffect(() => {
    if (open) requestAnimationFrame(() => instances.current[kind]?.resize());
  }, [open, kind, wide]);

  // Apply a state requested elsewhere (e.g. "reopen graph" on an attachment).
  useEffect(() => {
    if (!pendingLoad) return;
    const calc = instances.current[pendingLoad.kind];
    if (!calc) return; // retried once the instance registers
    calc.setState(pendingLoad.state, { allowUndo: true });
    clearPendingLoad();
  });

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCalculatorOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setCalculatorOpen]);

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 1800);
  };

  const registerInstance = useCallback((k: CalculatorKind, calc: DesmosCalculatorInstance | null) => {
    if (calc) instances.current[k] = calc;
    else delete instances.current[k];
    forceRender((n) => n + 1);
  }, []);

  const active = instances.current[kind];
  const canScreenshot = typeof active?.asyncScreenshot === "function";

  const insertIntoAnswer = () => {
    if (!active) return;
    const state = active.getState();
    saveCalculatorState(kind, state);
    if (canScreenshot) {
      active.asyncScreenshot!({ ...SHOT, format: "png", mode: "contain", showLabels: true }, (image) => {
        addAttachment({ kind, image, state });
        showFlash("Graph added to answer");
      });
    } else {
      addAttachment({ kind, state });
      showFlash("Working added to answer");
    }
  };

  const reset = () => {
    if (!active) return;
    if (active.setBlank) active.setBlank();
    else active.setState({});
    saveCalculatorState(kind, active.getState());
  };

  const available = KINDS.filter(({ kind: k }) => status !== "ready" || isCalculatorSupported(Desmos, k));

  return (
    <motion.aside
      aria-label="Desmos calculator"
      aria-hidden={!open}
      initial={false}
      animate={open ? { x: 0, visibility: "visible" } : { x: "100%", transitionEnd: { visibility: "hidden" } }}
      transition={{ type: "spring", stiffness: 380, damping: 38 }}
      className={cn(
        "fixed bottom-0 right-0 top-14 z-40 flex w-full flex-col border-l bg-background shadow-2xl",
        wide ? "sm:w-[min(900px,70vw)]" : "sm:w-[420px]",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <Tabs value={kind} onValueChange={(v) => setCalculatorKind(v as CalculatorKind)}>
          <TabsList>
            {available.map(({ kind: k, label, icon: Icon }) => (
              <TabsTrigger key={k} value={k} className="px-2 text-xs">
                <Icon /> <span className={cn(!wide && "hidden xl:inline")}>{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-0.5">
          <PanelButton label={canScreenshot ? "Insert graph into answer" : "Insert working into answer"} onClick={insertIntoAnswer} disabled={!active}>
            <ImagePlus />
          </PanelButton>
          <PanelButton label="Reset calculator" onClick={reset} disabled={!active}>
            <RotateCcw />
          </PanelButton>
          <PanelButton label={wide ? "Narrow panel" : "Widen panel"} onClick={toggleCalculatorWide} className="hidden sm:inline-flex">
            {wide ? <Minimize2 /> : <Maximize2 />}
          </PanelButton>
          <PanelButton label="Close (Esc)" onClick={() => setCalculatorOpen(false)}>
            <X />
          </PanelButton>
        </div>
      </div>

      <div className="relative flex-1">
        {KINDS.filter(({ kind: k }) => visited.has(k)).map(({ kind: k }) => (
          <div key={k} className={cn("absolute inset-0", k !== kind && "invisible")}>
            <DesmosCalculator
              kind={k}
              initialState={states[k]}
              onInstance={(c) => registerInstance(k, c)}
              onChange={(s) => saveCalculatorState(k, s)}
            />
          </div>
        ))}
        {flash && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs text-background shadow-lg">
            <Check className="h-3.5 w-3.5" /> {flash}
          </div>
        )}
      </div>
    </motion.aside>
  );
}

function PanelButton({
  label,
  children,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} className={cn("h-8 w-8", className)} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
