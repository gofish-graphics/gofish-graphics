import type { LabelStrategy } from "./types";

export type Strip = { x: number; y0: number; y1: number };

/**
 * d3-area-label-style placement: bisection-find the largest rectangle of the
 * label's aspect ratio that fits entirely inside the strip-defined area.
 *
 * Reads `node.renderData.strips` — sorted-by-x array of `{x, y0, y1}`
 * populated by the connect operator for area-mode marks.
 *
 * Adapted from https://github.com/curran/d3-area-label (Apache 2.0). The d3
 * dependencies (`d3-array.bisector` / `d3-scale.scaleLinear`) are replaced
 * with vanilla equivalents. Returns world-space center plus a font-size
 * scale relative to the input `labelHeight`.
 */
export const ribbonStrategy: LabelStrategy = {
  place(node, _obstacles, label, ctx) {
    const strips = node.renderData?.strips as Strip[] | undefined;
    if (!strips || strips.length < 2) return { kind: "hidden" };
    if (ctx.labelHeight <= 0 || ctx.labelWidth <= 0) return { kind: "hidden" };

    const aspectRatio = ctx.labelWidth / ctx.labelHeight;

    // Densify strips to a fixed resolution so sparse data still gets a smooth
    // interior search. Linear interpolation between provided strips.
    const dense = densifyStrips(strips, 400);

    const xMin = dense[0].x;
    const xMax = dense[dense.length - 1].x;
    if (xMax <= xMin) return { kind: "hidden" };

    // Clamp the scan range so the rect we want never exceeds the strip bounds.
    let lo = 0;
    let hi = Math.max(...dense.map((s) => s.y1 - s.y0));
    if (hi <= 0) return { kind: "hidden" };

    let best: { x: number; y: number; h: number } | null = null;
    const epsilon = 0.5;
    const maxIterations = 30;
    for (let i = 0; i < maxIterations && hi - lo > epsilon; i++) {
      const h = (lo + hi) / 2;
      const fit = tryFit(dense, h, aspectRatio);
      if (fit) {
        best = fit;
        lo = h;
      } else {
        hi = h;
      }
    }
    if (!best) return { kind: "hidden" };

    const tx = ctx.parentTranslate[0] + (node.transform?.translate?.[0] ?? 0);
    const ty = ctx.parentTranslate[1] + (node.transform?.translate?.[1] ?? 0);

    // Scale font size to the fitted height so the label fills the strip.
    const labelFontSize = label.fontSize ?? 11;
    const scale = best.h / ctx.labelHeight;

    return {
      kind: "transform",
      x: tx + best.x,
      y: ty + best.y,
      anchor: "middle",
      baseline: "central",
      fontSize: labelFontSize * scale,
    };
  },
};

function densifyStrips(strips: Strip[], n: number): Strip[] {
  const sorted = [...strips].sort((a, b) => a.x - b.x);
  const xMin = sorted[0].x;
  const xMax = sorted[sorted.length - 1].x;
  if (xMax === xMin) return sorted;
  const out: Strip[] = [];
  for (let i = 0; i < n; i++) {
    const x = xMin + ((xMax - xMin) * i) / (n - 1);
    // Find the bracketing pair via linear scan (fine for ≤ a few hundred strips).
    let j = 0;
    while (j < sorted.length - 1 && sorted[j + 1].x < x) j++;
    const a = sorted[j];
    const b = sorted[Math.min(j + 1, sorted.length - 1)];
    const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
    out.push({
      x,
      y0: a.y0 + (b.y0 - a.y0) * t,
      y1: a.y1 + (b.y1 - a.y1) * t,
    });
  }
  return out;
}

function tryFit(
  dense: Strip[],
  h: number,
  aspectRatio: number
): { x: number; y: number; h: number } | null {
  const w = h * aspectRatio;
  const xMin = dense[0].x;
  const xMax = dense[dense.length - 1].x;
  if (w > xMax - xMin) return null;

  // For each x_left candidate (every dense sample), check that the rect
  // [x_left, x_left + w] × [center_y - h/2, center_y + h/2] fits inside the
  // strip envelope. We need min(y1) - max(y0) over [x_left, x_left + w] >= h.
  for (let i = 0; i < dense.length; i++) {
    const xLeft = dense[i].x;
    const xRight = xLeft + w;
    if (xRight > xMax) break;
    let maxY0 = -Infinity;
    let minY1 = Infinity;
    for (let j = i; j < dense.length; j++) {
      const s = dense[j];
      if (s.x > xRight) break;
      if (s.y0 > maxY0) maxY0 = s.y0;
      if (s.y1 < minY1) minY1 = s.y1;
    }
    const clearance = minY1 - maxY0;
    if (clearance >= h) {
      // Center the rect vertically in the available clearance.
      const centerY = (maxY0 + minY1) / 2;
      const centerX = xLeft + w / 2;
      return { x: centerX, y: centerY, h };
    }
  }
  return null;
}
