// Prototype helpers for the folded-bars proposal. Throwaway: data, a
// story-level `fold` coord, an `along` coord, a spiral, and the helpers the
// "today" and "wrap" families use. Nothing here is in the library or the IR.

import type { CoordinateTransform } from "../../src/ast/coordinateTransforms/coord";

export type Pt = [number, number];

// ─── data ──────────────────────────────────────────────────────────────────

/** Du Bois, "Occupations of Georgia Negroes, males over 10", 1890. */
export const occupations = [
  { name: "Agricultural laborers", value: 98400 },
  { name: "Farmers and planters", value: 63012 },
  { name: "Laborers", value: 29723 },
  { name: "Steam railway employes", value: 7440 },
  { name: "Servants", value: 7000 },
  { name: "Draymen, hackmen", value: 4390 },
  { name: "Carpenters and joiners", value: 3761 },
  { name: "Saw and planing mill employes", value: 2471 },
  { name: "Messengers", value: 1970 },
  { name: "Wood choppers", value: 1399 },
  { name: "Blacksmiths and wheelwrights", value: 1328 },
  { name: "Clergymen", value: 1277 },
  { name: "Masons", value: 1243 },
  { name: "Brick-makers and potters", value: 977 },
  { name: "Barbers", value: 899 },
  { name: "Merchants", value: 837 },
  { name: "Painters, glaziers and varnishers", value: 676 },
  { name: "Boot and shoe makers", value: 632 },
  { name: "Professors and teachers", value: 620 },
  { name: "Livery stable keepers", value: 620 },
  { name: "Engineers", value: 520 },
  { name: "Gardeners and florists", value: 518 },
];

/** Du Bois, students taking the courses of study offered in Georgia
 *  schools. */
export const courses = [
  { name: "Business", value: 12 },
  { name: "Classical", value: 98 },
  { name: "Professional", value: 152 },
  { name: "Scientific", value: 161 },
  { name: "Normal", value: 383 },
  { name: "Industrial", value: 2252 },
];

/** Room air conditioner production, million units, 2025. */
export const airConditioners = [
  { name: "China", value: 209.0 },
  { name: "Thailand", value: 22.0 },
  { name: "India", value: 12.5 },
  { name: "Brazil", value: 6.4 },
  { name: "Malaysia", value: 6.0 },
  { name: "Japan", value: 5.0 },
  { name: "United States", value: 4.1 },
  { name: "Mexico", value: 3.5 },
  { name: "South Korea", value: 2.5 },
  { name: "Turkey", value: 2.2 },
];

/** Du Bois, assessed value of household and kitchen furniture owned by
 *  Georgia Negroes, dollars. */
export const furniture = [
  { year: "1875", value: 21186 },
  { year: "1880", value: 498532 },
  { year: "1885", value: 736170 },
  { year: "1890", value: 1173624 },
  { year: "1895", value: 1322694 },
  { year: "1899", value: 1434975 },
];

/** Made up for the hard cases: three segments per row; row C's total is
 *  about 2.5 lanes of `at: 100`, with a segment boundary near the first
 *  turn and the middle segment spanning the second. */
export const stacked = [
  { row: "A", part: "one", value: 30 },
  { row: "A", part: "two", value: 25 },
  { row: "A", part: "three", value: 15 },
  { row: "B", part: "one", value: 20 },
  { row: "B", part: "two", value: 40 },
  { row: "B", part: "three", value: 30 },
  { row: "C", part: "one", value: 96 },
  { row: "C", part: "two", value: 110 },
  { row: "C", part: "three", value: 44 },
  { row: "D", part: "one", value: 15 },
  { row: "D", part: "two", value: 20 },
  { row: "D", part: "three", value: 10 },
];

/** Made up: two adjacent rows that both fold at `at: 100`. */
export const twoLong = [
  { name: "Alpha", value: 40 },
  { name: "Beta", value: 230 },
  { name: "Gamma", value: 170 },
  { name: "Delta", value: 60 },
  { name: "Epsilon", value: 25 },
];

export const CRIMSON = "#dc143c";
export const PARCHMENT = "#e8d9c5";
export const AC_BLUE = "#2171b5";

// ─── the fold path, in pixels ──────────────────────────────────────────────

export type FoldGeometry = {
  /** One lane's straight run, pixels. */
  lane: number;
  /** Lane pitch, pixels: the distance from one lane's centerline to the
   *  next. The turn is a half circle of radius pitch / 2. */
  pitch: number;
  /** Whether the half circle counts toward the length. Default true. */
  turnCounts?: boolean;
};

/** The path length a free turn takes, pixels. See `foldAt`. */
const FREE_TURN = 0.5;

/**
 * The point at distance s along a folded centerline (pixels, math-handed,
 * y up), moved v up: lane 0 runs right from (0, 0), turns down by `pitch`
 * through a half circle, runs left, turns down again, and so on. When the
 * turn counts toward the length, a centerline of length s is s pixels of
 * path. When it does not, the half circle is squeezed into FREE_TURN pixels
 * of s: the bar still draws a true half ring, and each turn shortens the
 * lanes after it by half a pixel.
 *
 * EMULATION: a coordinate transform is one continuous map, and the bar's
 * midline is sampled by its own length (rect.tsx, adaptive resampling), so
 * a turn that takes no length at all would draw as a straight jump between
 * lanes. A layout `wrap` would draw lanes and turns as pieces and have no
 * such sliver.
 */
export const foldAt = (g: FoldGeometry, s: number, v: number): Pt => {
  const { lane: L, pitch: p, turnCounts = true } = g;
  const r = p / 2;
  const turn = turnCounts ? Math.PI * r : FREE_TURN;
  const period = L + turn;
  if (s <= 0) return [s, v];
  const i = Math.floor(s / period);
  const t = s - i * period;
  const right = i % 2 === 0;
  const y0 = v - i * p;
  if (t <= L) return [right ? t : L - t, y0];
  // In the turn: a half circle round (L or 0, y0 - r), the bar's offset v
  // carried round it as a ring.
  const theta = (Math.PI * (t - L)) / turn;
  const cx = right ? L : 0;
  const cy = y0 - r;
  return [cx + (right ? 1 : -1) * r * Math.sin(theta), cy + r * Math.cos(theta)];
};

// ─── Family A: fold as a coordinate transform ──────────────────────────────

export type FoldOptions = {
  /** The fold point, in data units of x: a lane is this long. */
  at: number;
  /** Lane pitch, pixels. */
  pitch: number;
  /** Whether the half-circle turn counts toward the bar's length. Default
   *  true. */
  turnCounts?: boolean;
  /**
   * EMULATION: how many lanes the space must have room for below the top
   * row's lane. A fitted space's box is decided in `fit` from its data
   * window (coord.tsx:356-384), which is the union of every row's x: it
   * cannot tell which row folds, and the window is the declared [0, at],
   * so it cannot tell how far any row folds either. It reserves this many
   * lanes under the bottom row. Default: from `longest`, else 0.
   */
  extraLanes?: number;
  /** Room at the right for the turn and the bar's thickness, pixels.
   *  Default pitch. */
  turnRoom?: number;
  /**
   * EMULATION: the space's height in pixels, without the lanes below. A
   * fitted space claims no size of its own: it fills the room its parent
   * gives it (coord.tsx:285-293), which in a spread of rows is the whole
   * chart's height. As one row's box it needs its row height passed in.
   * Default: the room it is given, less padding.
   */
  band?: number;
  /**
   * EMULATION: the longest value in the space, so `fit` can reserve its
   * lanes in the box it reports. With the window declared as [0, at], `fit`
   * cannot see the content's lengths, and the bars cannot carry a window of
   * their own: a bar given a position (`x: v(0)`) is a glyph inside a coord
   * and is drawn flat at its center (_node.ts:1393-1414, rect.tsx:340-357).
   */
  longest?: number;
};

const win = (w: [number, number]) => ({ min: w[0], max: w[1], size: w[1] - w[0] });

/**
 * `fold({ at, pitch })`: x runs straight for `at` data units, then turns
 * down through a half circle and runs back, each lane `pitch` pixels below
 * the last. y is pixels (the layout's own band space), unbent.
 *
 * A fitted space (it has `fit`, as `geo` does): its x budget is its data
 * window, so `w: "value"` inside it is in data units and the fold point is
 * a data value. Its y budget is the room it is given, in pixels.
 *
 * The thickness is carried around the turn as an annulus only because a
 * rect whose height is a literal number lowers through a nonlinear space as
 * its MIDLINE stroked at its thickness (rect.tsx:383-414), so only the
 * centerline is transformed. A rect whose height fills its band is lowered
 * as its four corners resampled (rect.tsx:428-446), and its turn is sheared.
 */
export const fold = (opts: FoldOptions): CoordinateTransform => {
  const { at, pitch, turnCounts = true, turnRoom = pitch } = opts;
  return {
    type: "fold",
    aliases: { x: "along", y: "across" },
    // WALL: a fitted space must have a data window on both axes
    // (coord.tsx:357-372 throws otherwise). On x a bar's `w: "value"` is a
    // size, not a position, so the rows carry no window there: the coord
    // declares [0, at], which is how the fold point is given (as an axis
    // domain, in data units), and which pins σ to 1 budget unit per data
    // unit. A bar that starts inside the window and runs past `at` is drawn
    // whole: it is just a longer path. But a mark wholly past the window is
    // CULLED (coord.tsx:733-758): a stacked segment that starts after `at`
    // vanishes. So with `longest` the window is [0, longest] instead, which
    // leaves σ at 1 (the budget is the window's width) and the fold point
    // where it was (`at` is used only in `fit`). On y a spread of rows is
    // ordinal and has no window either. Declaring one there makes the coord
    // read its claim from `impliedExtent` of an ordinal space
    // (coord.tsx:429-433), i.e. none, so the rows are laid out in the budget
    // `fit` returns with no σ.
    dataWindow: [win([0, Math.max(at, opts.longest ?? at)]), win([0, 1])] as any,
    transform: (p) => p,
    domain: [win([0, at]), win([0, 1])],
    fit: ({ size, padding, window }) => {
      const xSpan = window[0].max - window[0].min;
      const longest = opts.longest;
      const lanes =
        opts.extraLanes ??
        (longest !== undefined
          ? Math.max(0, Math.ceil(longest / at - 1e-9) - 1)
          : 0);
      const W = Math.max(1, size[0] - 2 * padding - turnRoom);
      const k = W / at; // pixels per data unit
      const below = lanes * pitch;
      // As one row's box (`band`), the lanes below make the row taller. As
      // the whole chart, they come out of the room it is given.
      const H = opts.band ?? Math.max(1, size[1] - 2 * padding - below);
      const g: FoldGeometry = { lane: W, pitch, turnCounts };
      return {
        budget: [xSpan, H],
        transform: ([u, v]) => {
          // The coord interior's y runs up (axisDirection.ts), so a spread's
          // first row would be at the bottom. Read y downward instead, so
          // the first row is on top, as in a bar chart, and lanes fold down.
          const s = (u + window[0].min) * k;
          const [x, y] = foldAt(g, s, H - v);
          return [x, y + below];
        },
        extent: { width: W + turnRoom, height: H + below },
      };
    },
  };
};

// ─── Family A: along a path ────────────────────────────────────────────────

/** A path in the space's box, in pixels, y DOWN (screen), and how many
 *  pixels of it `at` data units cover. */
export type BoxPath = { points: Pt[]; run: number };

export type AlongOptions = {
  /** Builds the path in the box the space is laid out in (its size less
   *  padding). The path is the TOP of the rows: a row whose band starts q
   *  pixels down runs along the path moved q pixels to the right of travel
   *  (down, on a path that runs right). */
  path: (box: { width: number; height: number }) => BoxPath;
  /** The data length of the path's `run` pixels: x is in data units, and
   *  every lane (every offset) is measured along its own centerline. */
  at: number;
};

/** Resample a polyline every `step` pixels. */
const resample = (pts: Pt[], step = 1): Pt[] => {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(len / step));
    for (let j = 1; j <= n; j++)
      out.push([ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n]);
  }
  return out;
};

/** A polyline offset d to the right of travel (y down), measured by arc
 *  length, extended straight past both ends. */
const offsetCurve = (base: Pt[], d: number) => {
  const n = base.length;
  const pts: Pt[] = base.map((p, i) => {
    const a = base[Math.max(0, i - 1)];
    const b = base[Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    // Right of travel on a y-down screen: (-ty, tx).
    return [p[0] - (ty / l) * d, p[1] + (tx / l) * d];
  });
  const cum = [0];
  for (let i = 1; i < n; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[n - 1];
  const dir = (i: number, j: number): Pt => {
    const l = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]) || 1;
    return [(pts[j][0] - pts[i][0]) / l, (pts[j][1] - pts[i][1]) / l];
  };
  const at = (s: number): Pt => {
    if (s <= 0) {
      const [ux, uy] = dir(0, 1);
      return [pts[0][0] + ux * s, pts[0][1] + uy * s];
    }
    if (s >= L) {
      const [ux, uy] = dir(n - 2, n - 1);
      return [pts[n - 1][0] + ux * (s - L), pts[n - 1][1] + uy * (s - L)];
    }
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const t = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
    return [
      pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t,
      pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t,
    ];
  };
  return { at, L };
};

/**
 * `along({ path, at })`: x runs along a path, measured by arc length, `at`
 * data units to the path's `run` pixels; y is the offset across it. A
 * fitted space like `fold`: x is in data units (its window declared as
 * [0, at], see `fold`), y is the room it is given, in pixels.
 *
 * Unlike `fold`, the space is NOT the same for every row: a row q pixels
 * down runs along the path's offset curve at q, the way the lanes of a
 * running track do. A row that never reaches a bend is straight; a row that
 * does is bent round the bend's center, not its own.
 */
export const along = (opts: AlongOptions): CoordinateTransform => {
  const { at } = opts;
  return {
    type: "along",
    aliases: { x: "along", y: "across" },
    dataWindow: [win([0, at]), win([0, 1])] as any,
    transform: (p) => p,
    domain: [win([0, at]), win([0, 1])],
    fit: ({ size, padding, window }) => {
      const W = Math.max(1, size[0] - 2 * padding);
      const H = Math.max(1, size[1] - 2 * padding);
      const { points, run } = opts.path({ width: W, height: H });
      const base = resample(points, 1);
      const k = run / at;
      const curves = new Map<number, ReturnType<typeof offsetCurve>>();
      const curveAt = (d: number) => {
        const key = Math.round(d * 100) / 100;
        let c = curves.get(key);
        if (!c) {
          c = offsetCurve(base, key);
          curves.set(key, c);
        }
        return c;
      };
      return {
        budget: [window[0].max - window[0].min, H],
        transform: ([u, v]) => {
          // A spread lays its first row out at v = 0, which the interior's
          // upward y puts at the bottom. Read v as the distance DOWN from
          // the path instead, so the first row runs on it (see `fold`).
          const q = v;
          const [x, y] = curveAt(q).at((u + window[0].min) * k);
          return [x, H - y];
        },
        extent: { width: W, height: H },
      };
    },
  };
};

/**
 * A polyline with each corner rounded by a circular arc of radius r (shrunk
 * where a segment is too short). Copied in spirit from the periodic-table
 * prototype's `fillet`.
 */
export const fillet = (pts: Pt[], r: number, step = 1): Pt[] => {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    const lu = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const lv = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const u: Pt = [(b[0] - a[0]) / lu, (b[1] - a[1]) / lu];
    const w: Pt = [(c[0] - b[0]) / lv, (c[1] - b[1]) / lv];
    const turn = Math.acos(Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1])));
    if (turn < 1e-6) {
      out.push(b);
      continue;
    }
    const d = Math.min(r * Math.tan(turn / 2), lu / 2, lv / 2);
    const rr = d / Math.tan(turn / 2);
    const start: Pt = [b[0] - u[0] * d, b[1] - u[1] * d];
    const side = Math.sign(u[0] * w[1] - u[1] * w[0]) || 1;
    const cx = start[0] - side * u[1] * rr;
    const cy = start[1] + side * u[0] * rr;
    const a0 = Math.atan2(start[1] - cy, start[0] - cx);
    const n = Math.max(2, Math.ceil((rr * turn) / step));
    for (let k = 0; k <= n; k++) {
      const ang = a0 + (side * turn * k) / n;
      out.push([cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
};

/**
 * The air conditioner chart's path: the top row's baseline from (x0, y0),
 * running right `run` pixels (the plot's width), on to the frame's right
 * side, then clockwise round the frame in a rounded-rectangle spiral that
 * moves `gap` pixels outward each lap, the first lap `inset` pixels inside
 * the box. y down.
 */
export const frameSpiral =
  (o: {
    x0: number;
    y0: number;
    run: number;
    /** The first lap's distance from each edge of the box. */
    inset: { right: number; bottom: number; left: number; top: number };
    gap: number;
    laps?: number;
    corner?: number;
  }) =>
  ({ width, height }: { width: number; height: number }): BoxPath => {
    const { x0, y0, run, inset, gap, laps = 3, corner = 18 } = o;
    const pts: Pt[] = [[x0, y0]];
    // Each side's distance from the box edge; each lap one gap further out.
    let { right: r, bottom: b, left: l, top: t } = inset;
    pts.push([width - r, y0]);
    for (let lap = 0; lap < laps; lap++) {
      pts.push([width - r, height - b]); // down the right side
      pts.push([l, height - b]); // left along the bottom
      pts.push([l, t]); // up the left side
      r -= gap;
      pts.push([width - r, t]); // right along the top, past the last right side
      b -= gap;
      l -= gap;
      t -= gap;
    }
    pts.push([width - r, height - b]);
    return { points: fillet(pts, corner), run };
  };

/**
 * Du Bois's furniture plate: a straight lead-in from the left edge to 12
 * o'clock, then a clockwise spiral inward, the radius shrinking `pitch`
 * pixels per turn. `run` is one outer turn (2π · outer radius). y down.
 */
export const leadInSpiral =
  (o: { margin: number; pitch: number; turns: number; leadIn?: number }) =>
  ({ width, height }: { width: number; height: number }): BoxPath => {
    const { margin, pitch, turns } = o;
    const R = Math.min(width, height) / 2 - margin;
    const cx = width / 2;
    const cy = height / 2;
    const lead = o.leadIn ?? R;
    const pts: Pt[] = lead > 0 ? [[cx - lead, cy - R]] : [];
    const n = Math.ceil(turns * 720);
    for (let i = 0; i <= n; i++) {
      const th = (2 * Math.PI * turns * i) / n;
      const r = R - (pitch * th) / (2 * Math.PI);
      pts.push([cx + r * Math.sin(th), cy - r * Math.cos(th)]);
    }
    return { points: pts, run: 2 * Math.PI * R };
  };

// ─── Family C: today's API, a bar as path vertices ─────────────────────────

/**
 * One value as the vertices of a folded bar's centerline, in data units:
 * x from 0 to `at` and back, the lane index times `pitch` subtracted from
 * `y` (the row's position). The turns are square: a step of `pitch` in y at
 * x = at (or 0). The length is measured on the straights only: a step in y
 * is in y's units, which are not x's.
 */
export const foldRows = (
  value: number,
  { at, pitch, y = 0 }: { at: number; pitch: number; y?: number }
): Pt[] => {
  const pts: Pt[] = [[0, y]];
  let left = value;
  let lane = 0;
  while (left > 0) {
    const len = Math.min(left, at);
    const right = lane % 2 === 0;
    const x = right ? len : at - len;
    const ly = y - lane * pitch;
    pts.push([x, ly]);
    left -= len;
    if (left > 0) pts.push([x, ly - pitch]);
    lane++;
  }
  return pts;
};

/**
 * One value as the vertices of a bar that follows a polyline of `corners`
 * (data units) until its length is used up. A step in y counts as
 * `xPerY` units of x. EMULATION: the true ratio is the chart's pixels per
 * x unit over its pixels per y unit, known only after layout, so it is
 * guessed from the chart's size.
 */
export const pathRows = (value: number, corners: Pt[], xPerY: number): Pt[] => {
  const pts: Pt[] = [corners[0]];
  let left = value;
  for (let i = 1; i < corners.length && left > 0; i++) {
    const [ax, ay] = corners[i - 1];
    const [bx, by] = corners[i];
    const len = Math.abs(bx - ax) + Math.abs(by - ay) * xPerY;
    if (len <= left) {
      pts.push([bx, by]);
      left -= len;
    } else {
      const t = left / len;
      pts.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
      left = 0;
    }
  }
  return pts;
};

/** The corners of a clockwise rectangular spiral round a plot whose x runs
 *  over [x0, x1] and whose rows sit at y in [y0, y1] (y up), starting from
 *  (0, yStart) and moving `gx` / `gy` outward each lap. */
export const frameCorners = (o: {
  yStart: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  gx: number;
  gy: number;
  laps: number;
}): Pt[] => {
  const pts: Pt[] = [[0, o.yStart]];
  let [x0, x1, y0, y1] = [o.x0, o.x1, o.y0, o.y1];
  pts.push([x1, o.yStart]);
  for (let lap = 0; lap < o.laps; lap++) {
    pts.push([x1, y0]); // down the right side
    pts.push([x0, y0]); // left along the bottom
    pts.push([x0, y1]); // up the left side
    x1 += o.gx;
    pts.push([x1, y1]); // right along the top, past the last right side
    // Each side of the next lap is one gap further out.
    x0 -= o.gx;
    y0 -= o.gy;
    y1 += o.gy;
  }
  pts.push([x1, y0]);
  return pts;
};

// ─── Family B: the fold as a wrap that breaks a bar into fragments ─────────

/**
 * Break each row's segments into per-lane fragments of at most `at` units
 * per lane, lanes alternating direction: even lanes run right from 0, odd
 * lanes run left from `at`. `x` is where the fragment starts on the shared
 * axis and `len` its length, so a fragment is `rect({ x: "x", w: "len" })`.
 * Rows without a `part` are one segment each.
 */
export const wrapRows = <T extends { value: number }>(
  rows: T[],
  { at, key = "name" }: { at: number; key?: string }
): (T & { lane: number; x: number; len: number })[] => {
  const out: (T & { lane: number; x: number; len: number })[] = [];
  const offsets = new Map<unknown, number>();
  for (const r of rows) {
    const k = (r as any)[key];
    let from = offsets.get(k) ?? 0;
    const to = from + r.value;
    offsets.set(k, to);
    while (from < to - 1e-9) {
      const lane = Math.floor(from / at + 1e-9);
      const end = Math.min(to, (lane + 1) * at);
      const a = from - lane * at;
      const b = end - lane * at;
      const right = lane % 2 === 0;
      out.push({ ...r, lane, x: right ? a : at - b, len: b - a });
      from = end;
    }
  }
  return out;
};
