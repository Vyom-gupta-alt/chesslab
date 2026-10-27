"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Calculator, GraduationCap, LineChart, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppStore, type CalculatorKind } from "@/lib/store";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Workspace" },
  { href: "/syllabus", label: "Syllabus" },
  { href: "/generate", label: "Paper Generator" },
  { href: "/exam", label: "Exam Mode" },
];

export function TopBar() {
  const pathname = usePathname();
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleCalculator = useAppStore((s) => s.toggleCalculator);
  const open = useAppStore((s) => s.calculatorOpen);
  const kind = useAppStore((s) => s.calculatorKind);

  // Alt+G → graphing, Alt+S → scientific (toggle).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const map: Record<string, CalculatorKind> = { g: "graphing", s: "scientific" };
      const k = map[e.key.toLowerCase()] ?? map[e.code.replace("Key", "").toLowerCase()];
      if (k) {
        e.preventDefault();
        toggleCalculator(k);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCalculator]);

  const calcButton = (k: CalculatorKind, label: string, shortcut: string, Icon: typeof LineChart) => {
    const active = open && kind === k;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={active ? "default" : "outline"}
            size="sm"
            aria-pressed={active}
            onClick={() => toggleCalculator(k)}
          >
            <Icon /> <span className="hidden md:inline">{label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Desmos {label} calculator ({shortcut})
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <Button variant="ghost" size="icon" aria-label="Toggle sidebar" onClick={toggleSidebar}>
        <PanelLeft />
      </Button>
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <GraduationCap className="h-5 w-5 text-primary" />
        <span className="hidden sm:inline">Grade Maxxer</span>
      </Link>
      <nav className="ml-4 hidden items-center gap-1 lg:flex">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              pathname === n.href && "bg-accent font-medium text-foreground",
            )}
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {calcButton("graphing", "Graphing", "Alt+G", LineChart)}
        {calcButton("scientific", "Scientific", "Alt+S", Calculator)}
      </div>
    </header>
  );
}
