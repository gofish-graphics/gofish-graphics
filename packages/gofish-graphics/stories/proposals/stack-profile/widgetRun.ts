// Precomputes the "Set it yourself" widgets on the proposal page:
// `node_modules/.bin/tsx stories/proposals/stack-profile/widgetRun.ts`
// writes proposals/stack-profile/widgets.json. For each model and each
// position of the moving shape it records the model's measure of the two
// compared gaps; the page finds where they are equal.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bridge, openedSides } from "./sdfModels";
import { scan, TEST_ROWS, U, type Pt, type Shape } from "./spacingModels";

const S = 56;
const T = 30;
const TV = U(0, S, 561);
const [square, up, down] = TEST_ROWS[0];
const [circle, left] = TEST_ROWS[2];
type Sides = ([number, number] | null)[];
const sidesOf = (sh: Shape): Sides => TV.map((v) => scan(sh.contours, v));
const ext = (sh: Shape) => {
  const xs = sh.contours[0].map((p) => p[0]);
  return [Math.min(...xs), Math.max(...xs)];
};
const lineGaps = (fp: Sides, a: number, nc: Sides, b: number) =>
  TV.map((_, k) => (fp[k] && nc[k] ? b + nc[k]![0] - a - fp[k]![1] : null));

function polyDist(a: Pt[], b: Pt[]) {
  const seg = (p: Pt, q: Pt, r: Pt) => {
    const [dx, dy] = [r[0] - q[0], r[1] - q[1]];
    const t = Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p[0] - q[0] - t * dx, p[1] - q[1] - t * dy);
  };
  let d = Infinity;
  for (const [P, Q] of [[a, b], [b, a]])
    P.forEach((p) => Q.forEach((q, j) => (d = Math.min(d, seg(p, q, Q[(j + 1) % Q.length])))));
  return d;
}
const shift = (sh: Shape, b: number) => sh.contours[0].map(([x, y]) => [x + b, y] as Pt);

/** Mean depth of a side, from the shape's outermost point, capped (absent lines count the cap). */
function meanDepth(sh: Shape, side: 0 | 1, cap: number) {
  const [lo, hi] = ext(sh);
  return TV.reduce((a, v) => {
    const s = scan(sh.contours, v);
    return a + (s ? Math.min(side ? hi - s[1] : s[0] - lo, cap) : cap);
  }, 0) / TV.length;
}

type Measure = (A: Shape, a: number, B: Shape, b: number) => number;
const opened = new Map<string, Sides>();
const openedOf = (sh: Shape, r: number) => {
  const k = `${sh.contours[0].length}${JSON.stringify(sh.contours[0][0])}|${r}`;
  if (!opened.has(k)) opened.set(k, openedSides(sh, r));
  return opened.get(k)!;
};
const minGap = (g: (number | null)[]) => Math.min(...(g.filter((x) => x !== null) as number[]));
const MODELS: { key: string; label: string; m: Measure }[] = [
  { key: "box", label: "box gap", m: (A, a, B, b) => b + ext(B)[0] - a - ext(A)[1] },
  { key: "contact", label: "contact", m: (A, a, B, b) => minGap(lineGaps(sidesOf(A), a, sidesOf(B), b)) },
  { key: "euclid", label: "(a) straight-line", m: (A, a, B, b) => polyDist(shift(A, a), shift(B, b)) },
  {
    key: "areaSum",
    label: "(b) area model",
    // the white the area model sees: box gap plus each facing side's mean depth, capped at S / 4
    m: (A, a, B, b) => b + ext(B)[0] - a - ext(A)[1] + meanDepth(A, 1, S / 4) + meanDepth(B, 0, S / 4),
  },
  {
    key: "pairArea",
    label: "(d) pair white area",
    m: (A, a, B, b) => {
      const g = lineGaps(sidesOf(A), a, sidesOf(B), b);
      return g.reduce((s: number, x) => s + (x === null ? T + 6 : Math.min(x, T + 6)), 0) / g.length;
    },
  },
  { key: "open4", label: "(g) opening r 4", m: (A, a, B, b) => minGap(lineGaps(openedOf(A, 4), a, openedOf(B, 4), b)) },
  { key: "open8", label: "(g) opening r 8", m: (A, a, B, b) => minGap(lineGaps(openedOf(A, 8), a, openedOf(B, 8), b)) },
  { key: "filletT", label: "(i) fillet R 30", m: (A, a, B, b) => bridge(A, a, B, b, "fillet", T).area / S },
  { key: "fillet2T", label: "(i) fillet R 60", m: (A, a, B, b) => bridge(A, a, B, b, "fillet", 2 * T).area / S },
];

// Widget 1: square, A, V, A. The triangles sit at a contact gap of 30 (a
// parallel strip, so every model but box agrees). p is the square's gap to
// the A, horizontal, from touching to three times the target.
const xA = 0;
const xV = xA + S + T - S / 2; // the strip between A and V is 30 px on every line
const xA2 = xV + S + T - S / 2;
const P1 = Array.from({ length: 91 }, (_, i) => i);
// Widget 2: circle, left triangle, square, with the circle and the square
// 120 px apart (box to box). t is the triangle tip's gap to the circle.
const D = 120;
const xT0 = S; // tip at the circle's right edge when t = 0
const xSq = S + D;
const P2 = Array.from({ length: D - S + 1 }, (_, i) => i);

const out: Record<string, unknown> = {
  S,
  T,
  shapes: { square: square.contours[0], up: up.contours[0], down: down.contours[0], circle: circle.contours[0], left: left.contours[0] },
  w1: { xA, xV, xA2, p: P1 },
  w2: { D, xT0, xSq, p: P2 },
  models: MODELS.map(({ key, label }) => ({ key, label })),
  m1: {},
  m2: {},
};
for (const { key, m } of MODELS) {
  const t0 = Date.now();
  const r = (x: number) => +x.toFixed(2);
  const av = m(up, xA, down, xV);
  (out.m1 as Record<string, unknown>)[key] = { gap: P1.map((p) => r(m(square, xA - S - p, up, xA))), ref: r(av) };
  (out.m2 as Record<string, unknown>)[key] = {
    a: P2.map((t) => r(m(circle, 0, left, xT0 + t))),
    b: P2.map((t) => r(m(left, xT0 + t, square, xSq))),
  };
  console.log(key, `${Date.now() - t0} ms`);
}
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../../../proposals/stack-profile/widgets.json"), JSON.stringify(out));
