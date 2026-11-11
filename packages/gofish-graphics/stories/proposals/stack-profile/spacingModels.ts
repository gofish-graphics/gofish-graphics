// Throwaway helpers for the stack-profile proposal: two ways to space
// irregular shapes along one axis, computed by hand so today's engine can
// draw the result as polygons. Units are pixels.
//
//   box      gap between bounding boxes (today's spread)
//   contact  the smallest gap between facing outlines, measured along the
//            spacing axis on each scanline, equals the gap (tidy trees, a
//            skyline)
import { GLYPHS } from "./glyphOutlines";

export type Model = "box" | "contact";
export type Pt = [number, number];

const U = (lo: number, hi: number, n: number) =>
  Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

/**
 * Place shapes one after another along an axis. On each scanline u[k],
 * `far(i)[k]` and `near(i)[k]` are shape i's far and near side relative to
 * its own origin (null where the shape is absent). Returns each origin.
 */
function place(
  n: number,
  u: number[],
  far: (i: number) => (number | null)[],
  near: (i: number) => (number | null)[],
  extent: (i: number) => [number, number],
  model: Model,
  gap: number
): number[] {
  const out: number[] = [];
  const sky: (number | null)[] = u.map(() => null);
  let boxEnd = -Infinity;
  for (let i = 0; i < n; i++) {
    const nr = near(i);
    let b = 0;
    if (i > 0) {
      if (model === "box") b = boxEnd + gap - extent(i)[0];
      else {
        b = -Infinity;
        u.forEach((_, k) => {
          if (sky[k] !== null && nr[k] !== null)
            b = Math.max(b, (sky[k] as number) + gap - (nr[k] as number));
        });
        if (b === -Infinity) b = boxEnd + gap - extent(i)[0];
      }
    }
    out.push(b);
    const fr = far(i);
    u.forEach((_, k) => {
      if (fr[k] !== null) sky[k] = Math.max(sky[k] ?? -Infinity, b + (fr[k] as number));
    });
    boxEnd = Math.max(boxEnd, b + extent(i)[1]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ridges with bounded supports whose peaks shift, spaced along y.

const RIDGES = [62, 48, 70, 44, 64, 52].map((amp, i) => ({ a: 10 + 46 * i, w: 130, amp }));
const RU = U(0, 420, 421);
/** A gamma-like bump: an early peak and a long right tail. */
const ridgeH = (r: (typeof RIDGES)[number], x: number) => {
  const t = (x - r.a) / r.w;
  if (t < 0 || t > 1) return null;
  const q = t / 0.18;
  return r.amp * q * q * Math.exp(2 * (1 - q));
};

export function ridgeRings(model: Model) {
  const base = place(
    RIDGES.length,
    RU,
    (i) => RU.map((x) => ridgeH(RIDGES[i], x)),
    (i) => RU.map((x) => (ridgeH(RIDGES[i], x) === null ? null : 0)),
    (i) => [0, RIDGES[i].amp],
    model,
    4
  );
  return RIDGES.map((r, i) => {
    const xs = RU.filter((x) => ridgeH(r, x) !== null);
    const top: Pt[] = xs.map((x) => [x, base[i] + (ridgeH(r, x) as number)]);
    return { c: `r${i}`, ring: [[xs[0], base[i]], ...top, [xs[xs.length - 1], base[i]]] as Pt[] };
  });
}

// ---------------------------------------------------------------------------
// Rows of shapes spaced along x: traced glyphs, and circles, triangles and
// squares. A shape is a list of contours (holes marked); its side on a
// scanline is the leftmost or rightmost crossing over all its contours.

export type Shape = { contours: Pt[][]; holes: boolean[] };

/** Leftmost and rightmost x of a set of rings on the line y = v. */
function scan(rings: Pt[][], v: number): [number, number] | null {
  const xs: number[] = [];
  for (const ring of rings)
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length];
      if ((p[1] <= v && q[1] > v) || (q[1] <= v && p[1] > v))
        xs.push(p[0] + ((v - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
    });
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
}

/** x offsets for one row of shapes. */
function rowOffsets(shapes: Shape[], model: Model, gap: number) {
  const ys = shapes.flatMap((s) => s.contours.flat().map((p) => p[1]));
  const V = U(Math.min(...ys), Math.max(...ys), 400);
  const sides = shapes.map((s) => V.map((v) => scan(s.contours, v)));
  return place(
    shapes.length,
    V,
    (i) => sides[i].map((s) => (s ? s[1] : null)),
    (i) => sides[i].map((s) => (s ? s[0] : null)),
    (i) => {
      const xs = shapes[i].contours.flat().map((p) => p[0]);
      return [Math.min(...xs), Math.max(...xs)];
    },
    model,
    gap
  );
}

/** Polygons for several rows, outer contours first and holes after. */
function rowsToRings(rows: Shape[][], model: Model, gap: number, pitch: number) {
  const outer: { c: string; ring: Pt[] }[] = [];
  const holes: { c: string; ring: Pt[] }[] = [];
  rows.forEach((shapes, r) => {
    const xs = rowOffsets(shapes, model, gap);
    const x0 = Math.min(...shapes[0].contours.flat().map((p) => p[0]));
    const dy = (rows.length - 1 - r) * pitch;
    shapes.forEach((s, i) =>
      s.contours.forEach((c, j) =>
        (s.holes[j] ? holes : outer).push({
          c: s.holes[j] ? "hole" : "ink",
          ring: c.map(([px, py]) => [px + xs[i] - x0 + 6, py + dy] as Pt),
        })
      )
    );
  });
  return [...outer, ...holes];
}

export const WORDS = ["Hamburg", "AVOW"];
export const glyphRows = (font: "serif" | "sans", model: Model) =>
  rowsToRings(
    WORDS.map((w) => GLYPHS[font][w].map((g) => ({ contours: g.contours, holes: g.holes }))),
    model,
    6,
    110
  ).map((d) => ({ ...d, ring: d.ring.map(([x, y]) => [x, y + 30] as Pt) }));

const S = 56;
const circle: Shape = {
  contours: [Array.from({ length: 72 }, (_, i) => {
    const t = (2 * Math.PI * i) / 72;
    return [S / 2 + (S / 2) * Math.cos(t), S / 2 + (S / 2) * Math.sin(t)] as Pt;
  })],
  holes: [false],
};
const square: Shape = { contours: [[[0, 0], [S, 0], [S, S], [0, S]]], holes: [false] };
const tri = (pts: Pt[]): Shape => ({ contours: [pts], holes: [false] });
const left = tri([[0, S / 2], [S, 0], [S, S]]); // points left
const right = tri([[0, 0], [S, S / 2], [0, S]]); // points right
const up = tri([[0, 0], [S, 0], [S / 2, S]]);
const down = tri([[0, S], [S / 2, 0], [S, S]]);
export const SHAPE_ROWS = ["○ ◁ □", "○ ▷ □", "△ ○ ▽ □", "□ △ ▽ △"];
const ROWS: Shape[][] = [
  [circle, left, square],
  [circle, right, square],
  [up, circle, down, square],
  [square, up, down, up],
];
export const shapeRows = (model: Model) => rowsToRings(ROWS, model, 10, 76);
