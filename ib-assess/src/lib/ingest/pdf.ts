import { loadScript } from "./load-script";

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

interface PdfPage {
  getTextContent(): Promise<{ items: { str: string; hasEOL?: boolean; transform: number[] }[] }>;
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
}
interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
}
interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: ArrayBuffer }): { promise: Promise<PdfDoc> };
}

async function pdfjs(): Promise<PdfJs> {
  await loadScript(`${PDFJS}/pdf.min.js`);
  const lib = (window as unknown as { pdfjsLib: PdfJs }).pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`;
  return lib;
}

/** Rebuild lines from pdf.js text items, using y-position changes as line breaks. */
function itemsToText(items: { str: string; hasEOL?: boolean; transform: number[] }[]) {
  let out = "";
  let lastY: number | null = null;
  for (const it of items) {
    const y = it.transform[5];
    if (lastY !== null && Math.abs(y - lastY) > 2 && !out.endsWith("\n")) out += "\n";
    out += it.str;
    if (it.hasEOL) out += "\n";
    lastY = y;
  }
  return out;
}

export interface PdfText {
  pages: number;
  text: string;
  /** Pages with almost no text layer (scanned) rendered to canvases for OCR. */
  scannedPages: HTMLCanvasElement[];
}

/** Extract text from a PDF in the browser; scanned pages are rendered for OCR instead. */
export async function readPdf(file: File, onProgress?: (p: number, label: string) => void): Promise<PdfText> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const texts: string[] = [];
  const scannedPages: HTMLCanvasElement[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    onProgress?.(n / doc.numPages, `Reading ${file.name}: page ${n} of ${doc.numPages}`);
    const page = await doc.getPage(n);
    const text = itemsToText((await page.getTextContent()).items);
    if (text.replace(/\s/g, "").length > 40) {
      texts.push(text);
      continue;
    }
    // Scanned page: render at ~2x for legible OCR.
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
    scannedPages.push(canvas);
  }
  return { pages: doc.numPages, text: texts.join("\n"), scannedPages };
}

/** Page count only (used to warn before sending very long PDFs to the AI). */
export async function pdfPageCount(file: File): Promise<number> {
  const lib = await pdfjs();
  return (await lib.getDocument({ data: await file.arrayBuffer() }).promise).numPages;
}
