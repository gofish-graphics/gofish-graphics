// THROWAWAY: the spacing models of the "Set it yourself" widgets, for any
// pair of shapes. A shape is a list of contours (holes inside, filled even
// odd). Every model measures the horizontal gap between a left shape A
// shifted by a and a right shape B shifted by b, on the scanlines of a band;
// a vertical gap is measured by swapping x and y first (transpose).
//
// Distances: the square and the circle of the test rows use enclose's exact
// primitives (grownPrim, primD); every other shape uses Quilez's exact polygon
// distance over all its contours. Each shape's distance is rasterized once
// (0.5 px cells) and looked up at any shift that is a multiple of 0.5 px.
import { grownPrim, primD } from "../../../src/ast/graphicalOperators/enclose/prims";
import { distTo } from "./sdfModels";
import { scan, TEST_ROWS, U, type Pt, type Shape } from "./spacingModels";

export const S = 56;
const T = 30;
const G = 0.5;
const M = 66; // raster margin: the largest fillet radius plus a few cells
const BIG = 1e9;
const [SQUARE] = TEST_ROWS[0];
const [CIRCLE] = TEST_ROWS[2];

export type Band = number[];
/** A container's wall: the box model measures to the container's box, not to the wall's nearest point. */
export type Wall = Shape & { box?: [number, number] };
/** Scanlines every 0.1 px from lo to hi. */
export const band = (lo: number, hi: number): Band => U(lo, hi, Math.round((hi - lo) / 0.1) + 1);
export const transpose = (sh: Shape): Shape => ({
  contours: sh.contours.map((c) => c.map(([x, y]) => [y, x] as Pt)),
  holes: sh.holes,
});
const all = (sh: Shape) => sh.contours.flat();
export const extX = (sh: Shape) => {
  const xs = all(sh).map((p) => p[0]);
  return [Math.min(...xs), Math.max(...xs)];
};
export const extY = (sh: Shape) => {
  const ys = all(sh).map((p) => p[1]);
  return [Math.min(...ys), Math.max(...ys)];
};

/** Quilez's exact signed distance to the even-odd fill of several contours. */
function polySdf(rings: Pt[][]) {
  return (x: number, y: number) => {
    let d = Infinity;
    let s = 1;
    for (const v of rings)
      for (let i = 0, j = v.length - 1; i < v.length; j = i, i++) {
        const [ex, ey] = [v[j][0] - v[i][0], v[j][1] - v[i][1]];
        if (ex === 0 && ey === 0) continue;
        const [wx, wy] = [x - v[i][0], y - v[i][1]];
        const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
        d = Math.min(d, (wx - ex * t) ** 2 + (wy - ey * t) ** 2);
        const c = [y >= v[i][1], y < v[j][1], ex * wy > ey * wx];
        if (c.every(Boolean) || c.every((b) => !b)) s = -s;
      }
    return s * Math.sqrt(d);
  };
}
function sdfOf(sh: Shape) {
  if (sh === CIRCLE) {
    const p = grownPrim({ kind: "disc", cx: S / 2, cy: S / 2, r: S / 2 }, 0);
    return (x: number, y: number) => primD(p, x, y);
  }
  if (sh === SQUARE) {
    const p = grownPrim({ kind: "box", x: 0, y: 0, w: S, h: S }, 0);
    return (x: number, y: number) => primD(p, x, y);
  }
  return polySdf(sh.contours);
}

type Grid = { i0: number; j0: number; nx: number; ny: number };
/** A grid whose cell (i, j) has its center at ((i0 + i + 0.5) G, (j0 + j + 0.5) G). */
const gridOver = (x0: number, x1: number, y0: number, y1: number): Grid => {
  const [i0, j0] = [Math.floor(x0 / G), Math.floor(y0 / G)];
  return { i0, j0, nx: Math.ceil(x1 / G) - i0, ny: Math.ceil(y1 / G) - j0 };
};
const cx = (g: Grid, i: number) => (g.i0 + i + 0.5) * G;
const cy = (g: Grid, j: number) => (g.j0 + j + 0.5) * G;

type Raster = { g: Grid; d: Float64Array };
const rasters = new WeakMap<Shape, Raster>();
/** The shape's exact signed distance on cells, out to M beyond its box. */
function raster(sh: Shape): Raster {
  let r = rasters.get(sh);
  if (!r) {
    const [[x0, x1], [y0, y1]] = [extX(sh), extY(sh)];
    const g = gridOver(x0 - M, x1 + M, y0 - M, y1 + M);
    const f = sdfOf(sh);
    const d = new Float64Array(g.nx * g.ny);
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) d[j * g.nx + i] = f(cx(g, i), cy(g, j));
    r = { g, d };
    rasters.set(sh, r);
  }
  return r;
}
/** Distance at the cell (I, J) of the global lattice for a shape shifted by (a, 0); a is a multiple of G. */
const at = (r: Raster, I: number, J: number, a: number) => {
  const i = I - Math.round(a / G) - r.g.i0;
  const j = J - r.g.j0;
  return i < 0 || j < 0 || i >= r.g.nx || j >= r.g.ny ? BIG : r.d[j * r.g.nx + i];
};

type Sides = ([number, number] | null)[];
const memo = new WeakMap<Shape, Map<string, Sides>>();
const cached = (sh: Shape, key: string, make: () => Sides) => {
  if (!memo.has(sh)) memo.set(sh, new Map());
  const m = memo.get(sh)!;
  if (!m.has(key)) m.set(key, make());
  return m.get(key)!;
};
const sidesOf = (sh: Shape, tv: Band) => cached(sh, `s${tv[0]}:${tv.length}`, () => tv.map((v) => scan(sh.contours, v)));

/** (g) The shape opened by a disc of radius r (shrink by r, grow by r), as sides per scanline. */
function openedSides(sh: Shape, r: number, tv: Band) {
  return cached(sh, `o${r}:${tv[0]}:${tv.length}`, () => {
    const R = raster(sh);
    const { g } = R;
    const eroded = new Uint8Array(g.nx * g.ny);
    for (let k = 0; k < eroded.length; k++) eroded[k] = R.d[k] <= -r ? 1 : 0;
    const dist = distTo(eroded, g.nx, g.ny);
    return tv.map((v) => {
      const j = Math.floor(v / G) - g.j0;
      if (j < 0 || j >= g.ny) return null;
      let [l, h] = [-1, -1];
      for (let i = 0; i < g.nx; i++)
        if (dist[j * g.nx + i] <= r) {
          if (l < 0) l = i;
          h = i;
        }
      return l < 0 ? null : ([cx(g, l) - G / 2, cx(g, h) + G / 2] as [number, number]);
    });
  });
}

const lineGaps = (fp: Sides, a: number, nc: Sides, b: number) =>
  fp.map((s, k) => (s && nc[k] ? b + nc[k]![0] - a - s[1] : null));
const minGap = (g: (number | null)[]) => Math.min(...(g.filter((x) => x !== null) as number[]));

/** The gap profile d(s): the horizontal gap on each scanline of the band, null where a shape is absent. */
export const gapProfile = (A: Shape, a: number, B: Shape, b: number, tv: Band) => lineGaps(sidesOf(A, tv), a, sidesOf(B, tv), b);

/**
 * (k) The power mean of a gap profile, (mean of d^p)^(1/p): p = -Infinity is
 * the min (contact), p = 0 the geometric mean, p = 1 the mean (white area over
 * the band). Each d is capped at `cap` first. With `union`, a line where a
 * shape is absent counts as the cap; otherwise it is left out (the
 * intersection band). A profile that touches or overlaps (some d <= 0) is
 * its min, so every p agrees once the shapes meet.
 */
export function powerMean(g: (number | null)[], p: number, cap = Infinity, union = false) {
  const ds: number[] = [];
  for (const x of g) {
    if (x === null) {
      if (union && isFinite(cap)) ds.push(cap);
    } else ds.push(Math.min(x, cap));
  }
  if (!ds.length) return NaN;
  const lo = Math.min(...ds);
  if (p === -Infinity || lo <= 0) return lo;
  if (p === Infinity) return Math.max(...ds);
  if (p === 0) return Math.exp(ds.reduce((s, d) => s + Math.log(d), 0) / ds.length);
  return (ds.reduce((s, d) => s + d ** p, 0) / ds.length) ** (1 / p);
}

function polyDist(A: Shape, a: number, B: Shape, b: number) {
  const seg = (p: Pt, q: Pt, r: Pt) => {
    const [dx, dy] = [r[0] - q[0], r[1] - q[1]];
    if (dx === 0 && dy === 0) return Math.hypot(p[0] - q[0], p[1] - q[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p[0] - q[0] - t * dx, p[1] - q[1] - t * dy);
  };
  const sh = (s: Shape, o: number) => s.contours.map((c) => c.map(([x, y]) => [x + o, y] as Pt));
  const [ca, cb] = [sh(A, a), sh(B, b)];
  let d = Infinity;
  for (const [P, Q] of [[ca, cb], [cb, ca]])
    for (const p of P.flat()) for (const ring of Q) ring.forEach((q, j) => (d = Math.min(d, seg(p, q, ring[(j + 1) % ring.length]))));
  return d;
}

/** Mean depth of a side over the band, from the shape's outermost point, capped (absent lines count the cap). */
function meanDepth(sh: Shape, side: 0 | 1, cap: number, tv: Band) {
  const [lo, hi] = extX(sh);
  return sidesOf(sh, tv).reduce((s, x) => s + (x ? Math.min(side ? hi - x[1] : x[0] - lo, cap) : cap), 0) / tv.length;
}

/**
 * (i) The area the closing of A ∪ B by a disc of radius R adds beyond the
 * two shapes, divided by the band's length: a mean gap.
 */
function fillet(A: Shape, a: number, B: Shape, b: number, R: number, tv: Band) {
  const [rA, rB] = [raster(A), raster(B)];
  const [ax, bx] = [extX(A), extX(B)];
  const [ay, by] = [extY(A), extY(B)];
  const g = gridOver(
    Math.min(a + ax[0], b + bx[0]) - R - 2,
    Math.max(a + ax[1], b + bx[1]) + R + 2,
    Math.min(ay[0], by[0]) - R - 2,
    Math.max(ay[1], by[1]) + R + 2
  );
  const n = g.nx * g.ny;
  const dmin = new Float64Array(n);
  for (let j = 0; j < g.ny; j++)
    for (let i = 0; i < g.nx; i++)
      dmin[j * g.nx + i] = Math.min(at(rA, g.i0 + i, g.j0 + j, a), at(rB, g.i0 + i, g.j0 + j, b));
  const far = new Uint8Array(n);
  for (let k = 0; k < n; k++) far[k] = dmin[k] >= R ? 1 : 0;
  const dist = distTo(far, g.nx, g.ny);
  let cells = 0;
  for (let k = 0; k < n; k++) if (dist[k] >= R && dmin[k] > 0) cells++;
  return (cells * G * G) / (tv[tv.length - 1] - tv[0]);
}

export type Measure = (A: Shape, a: number, B: Shape, b: number, tv: Band) => number;
export const MODELS: { key: string; label: string; m: Measure }[] = [
  {
    key: "box",
    label: "box gap",
    m: (A, a, B, b) => b + ((B as Wall).box ?? extX(B))[0] - a - ((A as Wall).box ?? extX(A))[1],
  },
  { key: "contact", label: "contact", m: (A, a, B, b, tv) => minGap(lineGaps(sidesOf(A, tv), a, sidesOf(B, tv), b)) },
  { key: "euclid", label: "(a) straight-line", m: (A, a, B, b) => polyDist(A, a, B, b) },
  {
    key: "areaSum",
    label: "(b) area model",
    // box gap plus each facing side's mean depth, capped at S / 4
    m: (A, a, B, b, tv) => b + extX(B)[0] - a - extX(A)[1] + meanDepth(A, 1, S / 4, tv) + meanDepth(B, 0, S / 4, tv),
  },
  {
    key: "pairArea",
    label: "(d) pair white area",
    m: (A, a, B, b, tv) =>
      lineGaps(sidesOf(A, tv), a, sidesOf(B, tv), b).reduce((s: number, x) => s + (x === null ? T + 6 : Math.min(x, T + 6)), 0) / tv.length,
  },
  { key: "open4", label: "(g) opening r 4", m: (A, a, B, b, tv) => minGap(lineGaps(openedSides(A, 4, tv), a, openedSides(B, 4, tv), b)) },
  { key: "open8", label: "(g) opening r 8", m: (A, a, B, b, tv) => minGap(lineGaps(openedSides(A, 8, tv), a, openedSides(B, 8, tv), b)) },
  { key: "filletT", label: "(i) fillet R 30", m: (A, a, B, b, tv) => fillet(A, a, B, b, T, tv) },
  { key: "fillet2T", label: "(i) fillet R 60", m: (A, a, B, b, tv) => fillet(A, a, B, b, 2 * T, tv) },
  // (k) the power mean of the gap profile (fitRun.ts fits p and the cap to the survey)
  { key: "pm8", label: "(k) power mean p −8", m: (A, a, B, b, tv) => powerMean(gapProfile(A, a, B, b, tv), -8) },
  { key: "pm3c", label: "(k) power mean p −3, cap 40", m: (A, a, B, b, tv) => powerMean(gapProfile(A, a, B, b, tv), -3, 40) },
  { key: "pm1h", label: "(k) harmonic mean p −1", m: (A, a, B, b, tv) => powerMean(gapProfile(A, a, B, b, tv), -1) },
  { key: "pm1", label: "(k) mean gap p 1", m: (A, a, B, b, tv) => powerMean(gapProfile(A, a, B, b, tv), 1) },
];
