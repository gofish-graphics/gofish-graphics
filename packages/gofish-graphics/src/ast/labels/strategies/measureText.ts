/**
 * Lightweight text measurement for the placer.
 * Uses an offscreen canvas when available; falls back to a character-count
 * approximation in non-DOM environments.
 */

let cachedCtx: CanvasRenderingContext2D | null | undefined;

function getCtx(): CanvasRenderingContext2D | null {
  if (cachedCtx !== undefined) return cachedCtx;
  if (typeof document === "undefined") {
    cachedCtx = null;
    return null;
  }
  const canvas = document.createElement("canvas");
  cachedCtx = canvas.getContext("2d");
  return cachedCtx;
}

export function measureLabelDimensions(
  text: string,
  fontSize: number,
  fontFamily = "source-sans-pro, sans-serif"
): { width: number; height: number } {
  const ctx = getCtx();
  if (ctx) {
    ctx.font = `${fontSize}px ${fontFamily.split(",")[0].trim()}`;
    const metrics = ctx.measureText(text);
    const ascent =
      (metrics as any).fontBoundingBoxAscent ??
      (metrics as any).actualBoundingBoxAscent ??
      fontSize * 0.8;
    const descent =
      (metrics as any).fontBoundingBoxDescent ??
      (metrics as any).actualBoundingBoxDescent ??
      fontSize * 0.2;
    return { width: metrics.width, height: ascent + descent };
  }
  return { width: text.length * fontSize * 0.6, height: fontSize };
}
