// Spacing with signed distance fields, emulated on Josh's three test rows.
// Node-only: `node_modules/.bin/tsx sdfModels.ts` writes sdfOffsets.json,
// which the stories read, so the browser does no solving.
//
// Reused from enclose: `grownPrim` and `primD` (prims.ts) give the exact
// signed distance to the circle (a disc) and the square (a box). The
// triangles use Quilez's exact polygon distance, written here. Morphology
// (opening, closing) is done on a raster: an exact distance per cell, then a
// Euclidean distance transform (Felzenszwalb and Huttenlocher).
import { grownPrim, primD } from "../../../src/ast/graphicalOperators/enclose/prims";
import { scan, TEST_ROWS, U, type Pt, type Shape } from "./spacingModels";

const S = 56;
const G = 0.5; // raster step, px
const TV = U(0, S, 561);

type Sdf = (x: number, y: number) => number;

/** Quilez's exact signed distance to a polygon. */
const polySdf = (v: Pt[]): Sdf => (x, y) => {
  let d = (x - v[0][0]) ** 2 + (y - v[0][1]) ** 2;
  let s = 1;
  for (let i = 0, j = v.length - 1; i < v.length; j = i, i++) {
    const [ex, ey] = [v[j][0] - v[i][0], v[j][1] - v[i][1]];
    const [wx, wy] = [x - v[i][0], y - v[i][1]];
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    d = Math.min(d, (wx - ex * t) ** 2 + (wy - ey * t) ** 2);
    const c = [y >= v[i][1], y < v[j][1], ex * wy > ey * wx];
    if (c.every(Boolean) || c.every((b) => !b)) s = -s;
  }
  return s * Math.sqrt(d);
};

/** The test shapes: a 72-gon is the circle, a 4-gon the square, else a polygon. */
function sdfOf(sh: Shape, dx: number): Sdf {
  const ring = sh.contours[0];
  if (ring.length === 72) {
    const p = grownPrim({ kind: "disc", cx: S / 2 + dx, cy: S / 2, r: S / 2 }, 0);
    return (x, y) => primD(p, x, y);
  }
  if (ring.length === 4) {
    const p = grownPrim({ kind: "box", x: dx, y: 0, w: S, h: S }, 0);
    return (x, y) => primD(p, x, y);
  }
  return polySdf(ring.map(([x, y]) => [x + dx, y] as Pt));
}

/** Squared Euclidean distance transform of one line (Felzenszwalb and Huttenlocher). */
const BIG = 1e20;
function edt1(f: Float64Array, n: number) {
  const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0;
  z[0] = -BIG;
  z[1] = BIG;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = BIG;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) ** 2 + f[v[k]];
  }
  return d;
}
/** Distance (px) from each cell to the nearest cell of `mask`. */
function distTo(mask: Uint8Array, nx: number, ny: number) {
  const g = new Float64Array(nx * ny);
  const col = new Float64Array(ny);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) col[j] = mask[j * nx + i] ? 0 : BIG;
    const d = edt1(col, ny);
    for (let j = 0; j < ny; j++) g[j * nx + i] = d[j];
  }
  const row = new Float64Array(nx);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) row[i] = g[j * nx + i];
    const d = edt1(row, nx);
    for (let i = 0; i < nx; i++) g[j * nx + i] = Math.sqrt(d[i]) * G;
  }
  return g;
}

type Grid = { x0: number; y0: number; nx: number; ny: number };
const gridOver = (x0: number, x1: number, y0: number, y1: number): Grid => ({
  x0, y0, nx: Math.ceil((x1 - x0) / G), ny: Math.ceil((y1 - y0) / G),
});
const cx = (g: Grid, i: number) => g.x0 + (i + 0.5) * G;
const cy = (g: Grid, j: number) => g.y0 + (j + 0.5) * G;

/** Sides per scanline of a mask. */
function maskSides(m: Uint8Array, g: Grid) {
  return TV.map((v) => {
    const j = Math.floor((v - g.y0) / G);
    if (j < 0 || j >= g.ny) return null;
    let [l, r] = [-1, -1];
    for (let i = 0; i < g.nx; i++) if (m[j * g.nx + i]) { if (l < 0) l = i; r = i; }
    return l < 0 ? null : ([cx(g, l) - G / 2, cx(g, r) + G / 2] as [number, number]);
  });
}

/** (g) Opening by a disc of radius r, from the exact distance: shrink by r, grow by r. */
export function openedSides(sh: Shape, r: number) {
  const d = sdfOf(sh, 0);
  const g = gridOver(-4, S + 4, -4, S + 4);
  const eroded = new Uint8Array(g.nx * g.ny);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) eroded[j * g.nx + i] = d(cx(g, i), cy(g, j)) <= -r ? 1 : 0;
  const dist = distTo(eroded, g.nx, g.ny);
  const opened = new Uint8Array(g.nx * g.ny);
  for (let k = 0; k < opened.length; k++) opened[k] = dist[k] <= r ? 1 : 0;
  return maskSides(opened, g);
}

/** (h) Closing of one shape by a disc of radius r: grow by r, shrink by r. */
function closedSides(sh: Shape, r: number) {
  const d = sdfOf(sh, 0);
  const g = gridOver(-r - 4, S + r + 4, -r - 4, S + r + 4);
  const far = new Uint8Array(g.nx * g.ny);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) far[j * g.nx + i] = d(cx(g, i), cy(g, j)) >= r ? 1 : 0;
  const dist = distTo(far, g.nx, g.ny);
  const closed = new Uint8Array(g.nx * g.ny);
  for (let k = 0; k < closed.length; k++) closed[k] = dist[k] >= r ? 1 : 0;
  return maskSides(closed, g);
}

const sidesOf = (sh: Shape) => TV.map((v) => scan(sh.contours, v));
const extOf = (sh: Shape) => {
  const xs = sh.contours[0].map((p) => p[0]);
  return [Math.min(...xs), Math.max(...xs)];
};
type Sides = ([number, number] | null)[];
/** The smallest offset b so every shared scanline has a gap of at least gap. */
const contact = (pb: number, fp: Sides, nc: Sides, gap: number) =>
  TV.reduce((b, _, k) => (fp[k] && nc[k] ? Math.max(b, pb + fp[k]![1] + gap - nc[k]![0]) : b), -Infinity);

/**
 * The area a bridge between two neighbors adds beyond the two shapes, and
 * the cells it covers. (i) "fillet": the closing of A ∪ B by a disc of
 * radius R, the region Shape.fillet draws with no padding: a point is in it
 * when no disc of radius R that misses both shapes covers it. (j) "smin":
 * the region where Quilez's polynomial smooth minimum of the two distances,
 * radius k, is below 0.
 */
export function bridge(prev: Shape, pb: number, cur: Shape, b: number, kind: "fillet" | "smin", R: number) {
  const [dA, dB] = [sdfOf(prev, pb), sdfOf(cur, b)];
  const g = gridOver(pb + extOf(prev)[0] - R - 2, b + extOf(cur)[1] + R + 2, -R - 2, S + R + 2);
  const n = g.nx * g.ny;
  const dmin = new Float64Array(n), smin = new Float64Array(n);
  for (let j = 0; j < g.ny; j++)
    for (let i = 0; i < g.nx; i++) {
      const [a, c] = [dA(cx(g, i), cy(g, j)), dB(cx(g, i), cy(g, j))];
      dmin[j * g.nx + i] = Math.min(a, c);
      const h = Math.max(R - Math.abs(a - c), 0) / R;
      smin[j * g.nx + i] = Math.min(a, c) - (h * h * R) / 4;
    }
  const added = new Uint8Array(n);
  if (kind === "fillet") {
    const far = new Uint8Array(n);
    for (let k = 0; k < n; k++) far[k] = dmin[k] >= R ? 1 : 0;
    const dist = distTo(far, g.nx, g.ny);
    for (let k = 0; k < n; k++) added[k] = dist[k] >= R && dmin[k] > 0 ? 1 : 0;
  } else for (let k = 0; k < n; k++) added[k] = smin[k] <= 0 && dmin[k] > 0 ? 1 : 0;
  let area = 0;
  for (let k = 0; k < n; k++) area += added[k];
  return { area: area * G * G, added, g };
}

export type SdfModel = "contact" | "opened" | "closed" | "fillet" | "smin";

/** Offsets for one row; for the bridge models, which pairs the floor set or the area never reached. */
export function sdfOffsets(shapes: Shape[], model: SdfModel, T: number, F: number, r: number) {
  const out = [0];
  const flag: string[] = [];
  for (let i = 1; i < shapes.length; i++) {
    const [prev, cur, pb] = [shapes[i - 1], shapes[i], out[i - 1]];
    const floor = contact(pb, sidesOf(prev), sidesOf(cur), F);
    let b: number;
    let f = "";
    if (model === "contact") b = contact(pb, sidesOf(prev), sidesOf(cur), T);
    else if (model === "opened" || model === "closed") {
      const side = model === "opened" ? openedSides : closedSides;
      b = Math.max(contact(pb, side(prev, r), side(cur, r), T), floor);
      if (b === floor) f = "F";
    } else {
      // move out from the floor until the bridge's area over the shapes'
      // height reaches the target; it may peak first, and then we stop there
      const meanGap = (s: number) => bridge(prev, pb, cur, s, model, r).area / S;
      if (meanGap(floor) >= T) (b = floor), (f = "F");
      else {
        let [best, bestS, hit] = [-1, floor, NaN];
        for (let s = floor + 1; s <= floor + 4 * T + 2 * r; s += 1) {
          const m = meanGap(s);
          if (m > best) [best, bestS] = [m, s];
          if (m >= T) { hit = s; break; }
        }
        if (Number.isNaN(hit)) (b = bestS), (f = "P");
        else {
          let [lo, hi] = [hit - 1, hit];
          for (let k = 0; k < 12; k++) {
            const m = (lo + hi) / 2;
            if (meanGap(m) < T) lo = m;
            else hi = m;
          }
          b = hi;
        }
      }
    }
    out.push(b);
    flag.push(f);
  }
  return { out, flag };
}

/** Mean horizontal gap per pair, over the lines both shapes share. */
export function meanGaps(shapes: Shape[], xs: number[]) {
  return shapes.slice(1).map((cur, j) => {
    const [fp, nc] = [sidesOf(shapes[j]), sidesOf(cur)];
    const gaps = TV.flatMap((_, k) => (fp[k] && nc[k] ? [xs[j + 1] + nc[k]![0] - xs[j] - fp[k]![1]] : []));
    return gaps.reduce((a, g) => a + g, 0) / gaps.length;
  });
}

/** The bridge cells of each pair, as one-row strips, for drawing. */
export function bridgeStrips(shapes: Shape[], xs: number[], kind: "fillet" | "smin", R: number) {
  const strips: Pt[][] = [];
  shapes.slice(1).forEach((cur, j) => {
    const { added, g } = bridge(shapes[j], xs[j], cur, xs[j + 1], kind, R);
    for (let jj = 0; jj < g.ny; jj++) {
      let start = -1;
      for (let i = 0; i <= g.nx; i++) {
        const on = i < g.nx && added[jj * g.nx + i];
        if (on && start < 0) start = i;
        if (!on && start >= 0) {
          const [x0, x1, y0] = [g.x0 + start * G, g.x0 + i * G, g.y0 + jj * G];
          strips.push([[x0, y0], [x1, y0], [x1, y0 + G], [x0, y0 + G]]);
          start = -1;
        }
      }
    }
  });
  return strips;
}

export const RUNS: { key: string; model: SdfModel; r: (T: number) => number; label: string }[] = [
  { key: "contact", model: "contact", r: () => 0, label: "contact (reference)" },
  { key: "opened4", model: "opened", r: () => 4, label: "(g) SDF opening, r 4" },
  { key: "opened8", model: "opened", r: () => 8, label: "(g) SDF opening, r 8" },
  { key: "closed8", model: "closed", r: () => 8, label: "(h) SDF closing, r 8" },
  { key: "filletA", model: "fillet", r: (T) => T, label: "(i) fillet area, R = target" },
  { key: "filletB", model: "fillet", r: (T) => 2 * T, label: "(i) fillet area, R = 2 × target" },
  { key: "sminA", model: "smin", r: (T) => 4 * T, label: "(j) smooth union, k = 4 × target" },
];
