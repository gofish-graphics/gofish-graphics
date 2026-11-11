// Throwaway helpers for the stack-profile proposal: two ways to space
// irregular shapes along one axis, computed by hand so today's engine can
// draw the result as polygons. Units are pixels.
//
//   box      gap between bounding boxes (today's spread)
//   contact  the smallest gap between facing outlines, measured along the
//            spacing axis on each scanline, equals the gap (tidy trees, a
//            skyline)
import { GLYPHS } from "./glyphOutlines";

export type Model = "box" | "contact" | "area";
/** The area model (HT Letterspacer style): each side of each shape gets a
 *  sidebearing from that shape alone. On scanlines in a band of heights, the
 *  edge's depth in from the shape's outermost point is clamped at `depth`;
 *  the sidebearing is `margin` minus the mean clamped depth, so a flat side
 *  gets `margin` and its white area plus sidebearing times band height is
 *  the same target for every side. Neighbors' sidebearings add up, and a
 *  contact gap of `floor` stops collisions. */
export type AreaOpts = { margin: number; depth: number; floor: number; band: (i: number) => [number, number] };
export type Pt = [number, number];

export const U = (lo: number, hi: number, n: number) =>
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
export function scan(rings: Pt[][], v: number): [number, number] | null {
  const xs: number[] = [];
  for (const ring of rings)
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length];
      if ((p[1] <= v && q[1] > v) || (q[1] <= v && p[1] > v))
        xs.push(p[0] + ((v - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
    });
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
}

/** The left and right sidebearings of one shape, from that shape alone. */
function sidebearings(shape: Shape, band: [number, number], o: AreaOpts): [number, number] {
  const V = U(band[0], band[1], 200);
  const sides = V.map((v) => scan(shape.contours, v));
  const xs = shape.contours.flat().map((p) => p[0]);
  const [lo, hi] = [Math.min(...xs), Math.max(...xs)];
  const mean = (f: (s: [number, number] | null) => number) =>
    sides.reduce((a, sd) => a + Math.min(f(sd), o.depth), 0) / sides.length;
  return [o.margin - mean((sd) => (sd ? sd[0] - lo : o.depth)), o.margin - mean((sd) => (sd ? hi - sd[1] : o.depth))];
}

/** x offsets for one row of shapes. */
function rowOffsets(shapes: Shape[], model: Model, gap: number, area?: AreaOpts) {
  const ys = shapes.flatMap((s) => s.contours.flat().map((p) => p[1]));
  const V = U(Math.min(...ys), Math.max(...ys), 400);
  const sides = shapes.map((s) => V.map((v) => scan(s.contours, v)));
  const ext = (i: number): [number, number] => {
    const xs = shapes[i].contours.flat().map((p) => p[0]);
    return [Math.min(...xs), Math.max(...xs)];
  };
  if (model === "area" && area) {
    const sb = shapes.map((sh, i) => sidebearings(sh, area.band(i), area));
    const out = [0];
    for (let i = 1; i < shapes.length; i++) {
      const byArea = out[i - 1] + ext(i - 1)[1] + sb[i - 1][1] + sb[i][0] - ext(i)[0];
      out.push(Math.max(byArea, contactAfter(out, i, area.floor, V, sides)));
    }
    return out;
  }
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

/** The contact position of shape i given the placed shapes before it. */
function contactAfter(
  out: number[],
  i: number,
  gap: number,
  V: number[],
  sides: ([number, number] | null)[][]
) {
  let b = -Infinity;
  V.forEach((_, k) => {
    const nr = sides[i][k];
    if (!nr) return;
    for (let j = 0; j < i; j++) {
      const fr = sides[j][k];
      if (fr) b = Math.max(b, out[j] + fr[1] + gap - nr[0]);
    }
  });
  return b;
}

/** Polygons for several rows, outer contours first and holes after. */
function rowsToRings(rows: Shape[][], model: Model, gap: number, pitch: number, area?: (r: number) => AreaOpts) {
  const outer: { c: string; ring: Pt[] }[] = [];
  const holes: { c: string; ring: Pt[] }[] = [];
  rows.forEach((shapes, r) => {
    const xs = rowOffsets(shapes, model, gap, area?.(r));
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
const top = (font: "serif" | "sans", ch: string) =>
  Math.max(...GLYPHS[font].Hamburg.find((g) => g.ch === ch)!.contours.flat().map((p) => p[1]));
export const glyphRows = (font: "serif" | "sans", model: Model) =>
  rowsToRings(
    WORDS.map((w) => GLYPHS[font][w].map((g) => ({ contours: g.contours, holes: g.holes }))),
    model,
    6,
    110,
    // band: baseline to cap height for capitals, to x-height for lowercase;
    // depth 20% of the x-height; flat stems get 3 px a side, as contact's 6 px gap
    (r) => ({
      margin: 3,
      depth: 0.2 * top(font, "u"),
      floor: 2,
      band: (i) => {
        const ch = WORDS[r][i];
        return [0, ch === ch.toUpperCase() ? top(font, "H") : top(font, "u")];
      },
    })
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
// band: each shape's own height; depth a quarter of it; flat sides get 5 px,
// as the 10 px box and contact gaps; contact floor 3 px
export const shapeRows = (model: Model) =>
  rowsToRings(ROWS, model, 10, 76, () => ({ margin: 5, depth: S / 4, floor: 3, band: () => [0, S] }));

// ---------------------------------------------------------------------------
// Josh's two test rows: square, up, down, up and up, circle, down, square.
// Goal: every gap looks the same. Each candidate model is emulated on both
// rows at a target gap T (what two flat sides get) with a contact floor F.

export type TestModel = "box" | "contact" | "euclid" | "areaSum" | "areaMax" | "pairArea" | "opened" | "blur";
export const TEST_ROWS: Shape[][] = [
  [square, up, down, up],
  [up, circle, down, square],
  [circle, left, square],
];
const TV = U(0, S, 561);
const sidesOf = (sh: Shape) => TV.map((v) => scan(sh.contours, v));
const extOf = (sh: Shape) => {
  const xs = sh.contours.flat().map((p) => p[0]);
  return [Math.min(...xs), Math.max(...xs)];
};

/** Smallest straight-line distance between two polygons (outer rings). */
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

/**
 * A shape's sides after a morphological opening by a disk of diameter w (an
 * erosion, then a dilation, each by w / 2): parts thinner than w, such as a
 * sharp tip, disappear, and the rest keeps its outline. Done on a raster.
 */
function openedSides(sh: Shape, w: number) {
  const g = 0.25, pad = 4, n = Math.round((S + 2 * pad) / g), r = w / 2 / g;
  const at = (i: number) => -pad + (i + 0.5) * g;
  const ring = sh.contours[0];
  const inside = (x: number, y: number) => {
    let c = false;
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      const [[xa, ya], [xb, yb]] = [ring[a], ring[b]];
      if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) c = !c;
    }
    return c;
  };
  const grid = Array.from({ length: n }, (_, j) => Array.from({ length: n }, (_, i) => inside(at(i), at(j))));
  const disk: [number, number][] = [];
  for (let dj = -Math.ceil(r); dj <= Math.ceil(r); dj++)
    for (let di = -Math.ceil(r); di <= Math.ceil(r); di++) if (di * di + dj * dj <= r * r) disk.push([di, dj]);
  const get = (m: boolean[][], i: number, j: number) => i >= 0 && j >= 0 && i < n && j < n && m[j][i];
  const eroded = grid.map((row, j) => row.map((_, i) => disk.every(([di, dj]) => get(grid, i + di, j + dj))));
  const opened = grid.map((row, j) => row.map((_, i) => disk.some(([di, dj]) => get(eroded, i + di, j + dj))));
  return TV.map((v) => {
    const row = opened[Math.min(n - 1, Math.max(0, Math.floor((v + pad) / g)))];
    const xs = row.flatMap((on, i) => (on ? [at(i)] : []));
    return xs.length ? ([xs[0] - g / 2, xs[xs.length - 1] + g / 2] as [number, number]) : null;
  });
}

/** Rasterize a shape's outer ring at `g` px with `pad` px around it. */
function raster(sh: Shape, g: number, pad: number) {
  const n = Math.round((S + 2 * pad) / g);
  const at = (i: number) => -pad + (i + 0.5) * g;
  const ring = sh.contours[0];
  const inside = (x: number, y: number) => {
    let c = false;
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      const [[xa, ya], [xb, yb]] = [ring[a], ring[b]];
      if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) c = !c;
    }
    return c;
  };
  return { n, at, grid: Array.from({ length: n }, (_, j) => Array.from({ length: n }, (_, i) => (inside(at(i), at(j)) ? 1 : 0))) };
}

/**
 * A shape's sides after a Gaussian blur of width sigma, cut at `level`: tips
 * and sharp corners, which have little ink around them, retract; the shape's
 * own hollows fill in. Scanlines run past the shape so a grown outline counts.
 */
const blurCache = new Map<string, ([number, number] | null)[]>();
export function blurredSides(sh: Shape, sigma: number, level = 0.5) {
  const key = `${JSON.stringify(sh.contours[0])}|${sigma}|${level}`;
  if (blurCache.has(key)) return blurCache.get(key)!;
  const g = 0.5, pad = 3 * sigma + 2;
  const { n, at, grid } = raster(sh, g, pad);
  const R = Math.ceil((3 * sigma) / g);
  const k = Array.from({ length: 2 * R + 1 }, (_, i) => Math.exp(-0.5 * (((i - R) * g) / sigma) ** 2));
  const ks = k.reduce((a, b) => a + b, 0);
  const pass = (m: number[][], horiz: boolean) =>
    m.map((row, j) =>
      row.map((_, i) => {
        let a = 0;
        for (let d = -R; d <= R; d++) {
          const [ii, jj] = horiz ? [i + d, j] : [i, j + d];
          if (ii >= 0 && jj >= 0 && ii < n && jj < n) a += k[d + R] * m[jj][ii];
        }
        return a / ks;
      })
    );
  const blurred = pass(pass(grid, true), false);
  const out = TVB.map((v) => {
    const j = Math.floor((v + pad) / g);
    if (j < 0 || j >= n) return null;
    const xs = blurred[j].flatMap((val, i) => (val >= level ? [at(i)] : []));
    return xs.length ? ([xs[0] - g / 2, xs[xs.length - 1] + g / 2] as [number, number]) : null;
  });
  blurCache.set(key, out);
  return out;
}
/** Scanlines for blurred outlines: a little past the shapes, in case they grow. */
const TVB = U(-8, S + 8, 641);

/** Horizontal contact: the smallest b so every shared scanline has a gap of at least g. */
function contactB(prevB: number, prev: Shape, cur: Shape, g: number, w = 0, sigma = 0) {
  if (sigma) {
    const [fp, nc] = [blurredSides(prev, sigma), blurredSides(cur, sigma)];
    let b = -Infinity;
    TVB.forEach((_, k) => {
      if (fp[k] && nc[k]) b = Math.max(b, prevB + fp[k]![1] + g - nc[k]![0]);
    });
    return b;
  }
  const [fp, nc] = w ? [openedSides(prev, w), openedSides(cur, w)] : [sidesOf(prev), sidesOf(cur)];
  let b = -Infinity;
  TV.forEach((_, k) => {
    if (fp[k] && nc[k]) b = Math.max(b, prevB + fp[k]![1] + g - nc[k]![0]);
  });
  return b;
}

/** Mean white between two facing sides, each scanline capped at `cap`. */
function pairWhite(prevB: number, prev: Shape, cur: Shape, b: number, cap: number) {
  const [fp, nc] = [sidesOf(prev), sidesOf(cur)];
  return TV.reduce((a, _, k) => a + (fp[k] && nc[k] ? Math.min(b + nc[k]![0] - prevB - fp[k]![1], cap) : cap), 0) / TV.length;
}

/** Solve f(b) = target for increasing f by bisection. */
function bisect(f: (b: number) => number, target: number, lo: number, hi: number) {
  for (let k = 0; k < 50; k++) {
    const m = (lo + hi) / 2;
    if (f(m) < target) lo = m;
    else hi = m;
  }
  return hi;
}

function testOffsets(shapes: Shape[], model: TestModel, T: number, F: number, w = 0) {
  const out = [0];
  const floored: boolean[] = [];
  // area model: a flat side gets T / 2, depth a quarter of the height
  const area: AreaOpts = { margin: T / 2, depth: S / 4, floor: F, band: () => [0, S] };
  const sb = shapes.map((sh) => sidebearings(sh, [0, S], area));
  for (let i = 1; i < shapes.length; i++) {
    const [prev, cur, pb] = [shapes[i - 1], shapes[i], out[i - 1]];
    const touch = (m: number) => pb + extOf(prev)[1] + m - extOf(cur)[0];
    const c0 = contactB(pb, prev, cur, 0);
    let b: number;
    if (model === "box") b = touch(T);
    else if (model === "contact") b = contactB(pb, prev, cur, T);
    // contact on the opened outline: tips thinner than w may come closer
    else if (model === "opened") b = contactB(pb, prev, cur, T, w);
    // contact on the blurred outline (Gaussian of width w, cut at 0.5)
    else if (model === "blur") b = contactB(pb, prev, cur, T, 0, w);
    else if (model === "euclid") b = bisect((m) => polyDist(shift(prev, pb), shift(cur, m)), T, c0 - 1, c0 + 4 * T);
    else if (model === "areaSum") b = touch(sb[i - 1][1] + sb[i][0]);
    else if (model === "areaMax") b = touch(Math.max(sb[i - 1][1], sb[i][0]));
    // the mean white between the two facing sides, each scanline capped at
    // T + 6, equals T: what a parallel strip T wide has
    else b = bisect((m) => pairWhite(pb, prev, cur, m, T + 6), T, c0, c0 + 6 * T);
    const floor = model === "box" || model === "contact" || model === "euclid" || model === "opened" || model === "blur" ? -Infinity : contactB(pb, prev, cur, F);
    floored.push(floor > b);
    out.push(Math.max(b, floor));
  }
  return { out, floored };
}

/** Per pair: the smallest and mean horizontal gap, the straight-line distance, and whether the floor set it. */
export function testGaps(model: TestModel, T: number, F: number, w = 0) {
  return TEST_ROWS.map((shapes) => {
    const { out: xs, floored } = testOffsets(shapes, model, T, F, w);
    return shapes.slice(1).map((cur, j) => {
      const [fp, nc] = [sidesOf(shapes[j]), sidesOf(cur)];
      const gaps = TV.flatMap((_, k) => (fp[k] && nc[k] ? [xs[j + 1] + nc[k]![0] - xs[j] - fp[k]![1]] : []));
      return {
        min: +Math.min(...gaps).toFixed(1),
        mean: +(gaps.reduce((a, g) => a + g, 0) / gaps.length).toFixed(1),
        euclid: +polyDist(shift(shapes[j], xs[j]), shift(cur, xs[j + 1])).toFixed(1),
        floor: floored[j],
      };
    });
  });
}

export const testRows = (model: TestModel, T: number, F: number, w = 0, halo = false) =>
  TEST_ROWS.flatMap((shapes, r) => {
    const { out: xs } = testOffsets(shapes, model, T, F, w);
    const dy = (TEST_ROWS.length - 1 - r) * 76 + 4;
    const ink = shapes.map((s, i) => ({ c: "ink", ring: s.contours[0].map(([x, y]) => [x + xs[i] + 6, y + dy] as Pt) }));
    if (!halo) return ink;
    // the blurred outline that is actually spaced, drawn under the ink
    const halos = shapes.map((s, i) => {
      const sides = blurredSides(s, w).flatMap((d, k) => (d ? [[d, TVB[k]] as const] : []));
      const ring = [
        ...sides.map(([d, v]) => [d[0] + xs[i] + 6, v + dy] as Pt),
        ...sides.reverse().map(([d, v]) => [d[1] + xs[i] + 6, v + dy] as Pt),
      ];
      return { c: "halo", ring };
    });
    return [...halos, ...ink];
  });
