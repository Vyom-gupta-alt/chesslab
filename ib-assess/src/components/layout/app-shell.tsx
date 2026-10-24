"use client";

import { useEffect, type ReactNode } from "react";
import { TopBar } from "./top-bar";
import { Sidebar } from "./sidebar";
import { CalculatorPanel } from "@/components/desmos/calculator-panel";
import { DesmosProvider } from "@/components/desmos/desmos-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const calcOpen = useAppStore((s) => s.calculatorOpen);
  const calcWide = useAppStore((s) => s.calculatorWide);

  useEffect(() => {
    useAppStore.persist.rehydrate();
  }, []);

  return (
    <DesmosProvider>
      <TooltipProvider delayDuration={300}>
        <TopBar />
        <Sidebar />
        <main
          className={cn(
            "min-h-screen pt-14 transition-[padding] duration-200",
            sidebarOpen && "lg:pl-72",
            // On large screens the calculator sits beside the content instead of covering it.
            calcOpen && (calcWide ? "xl:pr-[min(900px,70vw)]" : "xl:pr-[420px]"),
          )}
        >
          {children}
        </main>
        <CalculatorPanel />
      </TooltipProvider>
    </DesmosProvider>
  );
}
