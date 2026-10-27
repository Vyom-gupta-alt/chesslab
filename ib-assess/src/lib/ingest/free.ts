import { parseSyllabusText } from "./heuristic";
import type { DraftSyllabus } from "./draft";
import { sourceKind } from "./files";
import { ocrImages } from "./ocr";
import { readPdf } from "./pdf";

/**
 * Free mode: everything runs in the browser. PDFs are read with pdf.js, screenshots and
 * scanned pages with Tesseract OCR, then the text goes through the rule-based parser.
 */
export async function extractFree(
  files: File[],
  pasted: string,
  onProgress?: (p: number, label: string) => void,
): Promise<{ draft: DraftSyllabus; text: string }> {
  const parts: string[] = [];
  const toOcr: (Blob | HTMLCanvasElement)[] = [];

  for (const f of files) {
    const kind = sourceKind(f);
    if (kind === "pdf") {
      const pdf = await readPdf(f, (p, l) => onProgress?.(p * 0.3, l));
      if (pdf.text.trim()) parts.push(pdf.text);
      toOcr.push(...pdf.scannedPages);
    } else if (kind === "image") toOcr.push(f);
    else if (kind === "text") parts.push(await f.text());
  }
  if (toOcr.length) parts.push(...(await ocrImages(toOcr, (p, l) => onProgress?.(0.3 + p * 0.7, l))));
  if (pasted.trim()) parts.push(pasted);

  const text = parts.join("\n\n");
  onProgress?.(1, "Building topic tree…");
  return { draft: parseSyllabusText(text), text };
}
