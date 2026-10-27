export type SourceKind = "image" | "pdf" | "text";

export function sourceKind(file: File): SourceKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name)) return "text";
  return null;
}

export function fileToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Re-encode an image as JPEG/PNG no larger than `maxSide` px, so phone photos stay under
 * the API's 5 MB per-image limit and formats like HEIC-converted files are normalised.
 */
export async function prepareImageForApi(
  file: Blob,
  maxSide = 2000,
): Promise<{ data: string; mediaType: "image/jpeg" | "image/png" }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // Screenshots compress better (and stay sharper) as PNG; photos as JPEG.
  const png = file.type === "image/png" && canvas.width * canvas.height < 2_500_000;
  const mediaType = png ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't read image"))), mediaType, 0.9),
  );
  return { data: await fileToBase64(blob), mediaType };
}
