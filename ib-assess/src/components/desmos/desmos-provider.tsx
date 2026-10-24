"use client";

import Script from "next/script";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { DesmosNamespace } from "@/types/desmos";

export const DESMOS_API_VERSION = "v1.12";
/** Desmos' public demo key. Set NEXT_PUBLIC_DESMOS_API_KEY for production. */
const DEMO_KEY = "dcb31709b452b1cf9dc26972add0fda6";
const API_KEY = process.env.NEXT_PUBLIC_DESMOS_API_KEY || DEMO_KEY;
const SRC = `https://www.desmos.com/api/${DESMOS_API_VERSION}/calculator.js?apiKey=${API_KEY}`;

type Status = "loading" | "ready" | "error";

interface DesmosContextValue {
  status: Status;
  Desmos: DesmosNamespace | null;
}

const DesmosContext = createContext<DesmosContextValue>({ status: "loading", Desmos: null });

/**
 * Loads the Desmos API script once for the whole app and exposes it via context.
 * Children can render calculators as soon as `status === "ready"`.
 */
export function DesmosProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<DesmosContextValue>({ status: "loading", Desmos: null });

  return (
    <DesmosContext.Provider value={value}>
      <Script
        id="desmos-api"
        src={SRC}
        strategy="afterInteractive"
        // onReady also fires on remount when the script is already cached.
        onReady={() =>
          setValue(window.Desmos ? { status: "ready", Desmos: window.Desmos } : { status: "error", Desmos: null })
        }
        onError={() => setValue({ status: "error", Desmos: null })}
      />
      {children}
    </DesmosContext.Provider>
  );
}

export function useDesmos() {
  return useContext(DesmosContext);
}
