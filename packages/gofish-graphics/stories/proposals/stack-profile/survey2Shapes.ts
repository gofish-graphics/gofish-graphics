// Shapes and candidate strategies for the second "Spacing by eye" survey
// (survey2Run.ts). Coordinates are y up, size s (56 px in v1).
import type { Pt, Shape } from "./spacingModels";
import { band, extX, extY, gapProfile, gapProfileK, powerMean, type Band } from "./widgetModels";

const poly = (pts: Pt[]): Shape => ({ contours: [pts], holes: [false] });
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt;
  });

/** Every shape in the library, at size s. Names say which way a tip or a flat side faces. */
export const library = (s: number): Record<string, Shape> => ({
  square: poly([[0, 0], [s, 0], [s, s], [0, s]]),
  circle: poly(arc(s / 2, s / 2, s / 2, 0, 2 * Math.PI, 96).slice(0, -1)),
  diamond: poly([[s / 2, 0], [s, s / 2], [s / 2, s], [0, s / 2]]),
  triUp: poly([[0, 0], [s, 0], [s / 2, s]]),
  triDown: poly([[0, s], [s / 2, 0], [s, s]]),
  triLeft: poly([[0, s / 2], [s, 0], [s, s]]), // tip points left
  triRight: poly([[0, 0], [s, s / 2], [0, s]]), // tip points right
  sharpRight: poly([[0, s * 0.3], [s * 1.4, s / 2], [0, s * 0.7]]), // a narrow spike pointing right
  sharpLeft: poly([[0, s / 2], [s * 1.4, s * 0.3], [s * 1.4, s * 0.7]]),
  wideRight: poly([[0, 0], [s * 0.5, s / 2], [0, s]]), // a blunt wedge pointing right
  wideLeft: poly([[0, s / 2], [s * 0.5, 0], [s * 0.5, s]]),
  // an L: a stem on the left, a foot along the bottom; its notch opens to the right
  lRight: poly([[0, 0], [s, 0], [s, s * 0.36], [s * 0.36, s * 0.36], [s * 0.36, s], [0, s]]),
  // its mirror: the notch opens to the left
  lLeft: poly([[0, 0], [s, 0], [s, s], [s * 0.64, s], [s * 0.64, s * 0.36], [0, s * 0.36]]),
  semiRight: poly(arc(0, s / 2, s / 2, -Math.PI / 2, Math.PI / 2, 48)), // flat side left, round side right
  semiLeft: poly(arc(s / 2, s / 2, s / 2, Math.PI / 2, (3 * Math.PI) / 2, 48)), // round side left
});

/** A thin five-pointed star, for a difficulty control. */
export const star = (s: number): Shape =>
  poly(
    Array.from({ length: 10 }, (_, i) => {
      const r = i % 2 ? s * 0.16 : s / 2;
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      return [s / 2 + r * Math.cos(a), s / 2 + r * Math.sin(a)] as Pt;
    })
  );

export const mirror = (sh: Shape): Shape => {
  const [x0, x1] = extX(sh);
  return { contours: sh.contours.map((c) => c.map(([x, y]) => [x0 + x1 - x, y] as Pt).reverse()), holes: sh.holes };
};

type Strategy = (A: Shape, a: number, B: Shape, b: number, tv: Band) => number;
/** The five strategies the survey tries to tell apart (round 14's results). */
export const CANDIDATES: { key: string; label: string; m: Strategy }[] = [
  { key: "box", label: "bounding box", m: (A, a, B, b) => b + extX(B)[0] - a - extX(A)[1] },
  { key: "contact", label: "contact", m: (A, a, B, b, tv) => powerMean(gapProfile(A, a, B, b, tv), -Infinity) },
  { key: "pm3c", label: "power mean p −3, cap 40", m: (A, a, B, b, tv) => powerMean(gapProfile(A, a, B, b, tv), -3, 40) },
  { key: "hull", label: "hull, p −8", m: (A, a, B, b, tv) => powerMean(gapProfileK(A, a, B, b, tv, 1), -8) },
  { key: "mean", label: "mean gap p 1", m: (A, a, B, b, tv) => powerMean(gapProfile(A, a, B, b, tv), 1) },
];

/** The band of a pair: every line either shape covers. */
export const pairBand = (A: Shape, B: Shape) => {
  const [ya, yb] = [extY(A), extY(B)];
  return band(Math.min(ya[0], yb[0]), Math.max(ya[1], yb[1]));
};

/**
 * Where one strategy puts B to the right of A: the box gap v at which its
 * measure of the pair equals `target` (a square pair at that gap measures
 * `target` under every strategy). Bisection; the measures grow with v.
 */
export function place(m: Strategy, A: Shape, B: Shape, target: number, lo = -80, hi = 240) {
  const tv = pairBand(A, B);
  const at = (v: number) => m(A, 0, B, extX(A)[1] + v - extX(B)[0], tv);
  if (at(lo) > target || at(hi) < target) return null;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < target) lo = mid;
    else hi = mid;
  }
  return +((lo + hi) / 2).toFixed(2);
}
