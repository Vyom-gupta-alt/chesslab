import { loadScript } from "./load-script";

/** Tesseract.js v5 (browser OCR). Loaded from the CDN only when free mode reads an image. */
const TESSERACT_SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

interface TesseractWorker {
  recognize(image: Blob | HTMLCanvasElement): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
}
interface TesseractGlobal {
  createWorker(
    lang: string,
    oem?: number,
    opts?: { logger?: (m: { status: string; progress: number }) => void },
  ): Promise<TesseractWorker>;
}

/** OCR several images with one worker. `onProgress` gets 0–1 across all images. */
export async function ocrImages(
  images: (Blob | HTMLCanvasElement)[],
  onProgress?: (p: number, label: string) => void,
): Promise<string[]> {
  await loadScript(TESSERACT_SRC);
  const T = (window as unknown as { Tesseract: TesseractGlobal }).Tesseract;
  let current = 0;
  const worker = await T.createWorker("eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text") onProgress?.((current + m.progress) / images.length, `Reading image ${current + 1} of ${images.length}`);
      else if (current === 0) onProgress?.(0, "Loading text recognition…");
    },
  });
  try {
    const out: string[] = [];
    for (; current < images.length; current++) {
      const { data } = await worker.recognize(images[current]);
      out.push(data.text);
    }
    onProgress?.(1, "Done");
    return out;
  } finally {
    await worker.terminate();
  }
}
