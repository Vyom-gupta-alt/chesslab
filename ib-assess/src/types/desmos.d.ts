/**
 * Minimal typings for the parts of the Desmos API (v1.12) this app uses.
 * Full reference: https://www.desmos.com/api/v1.12/docs/index.html
 */
export type DesmosState = Record<string, unknown>;

export interface DesmosScreenshotOptions {
  width?: number;
  height?: number;
  targetPixelRatio?: number;
  format?: "png" | "svg";
  mode?: "contain" | "stretch" | "preserveX" | "preserveY";
  showLabels?: boolean;
}

export interface DesmosCalculatorInstance {
  getState(): DesmosState;
  setState(state: DesmosState, opts?: { allowUndo?: boolean }): void;
  setBlank?(): void;
  resize(): void;
  destroy(): void;
  updateSettings?(settings: Record<string, unknown>): void;
  setExpression?(expr: { id?: string; latex: string; [k: string]: unknown }): void;
  asyncScreenshot?(opts: DesmosScreenshotOptions, cb: (data: string) => void): void;
  observeEvent?(event: "change", cb: () => void): void;
  unobserveEvent?(event: "change"): void;
}

type CalculatorFactory = (el: HTMLElement, options?: Record<string, unknown>) => DesmosCalculatorInstance;

export interface DesmosNamespace {
  GraphingCalculator: CalculatorFactory;
  ScientificCalculator: CalculatorFactory;
  FourFunctionCalculator?: CalculatorFactory;
  Geometry?: CalculatorFactory;
  Calculator3D?: CalculatorFactory;
  supportedLanguages?: string[];
}

declare global {
  interface Window {
    Desmos?: DesmosNamespace;
  }
}
