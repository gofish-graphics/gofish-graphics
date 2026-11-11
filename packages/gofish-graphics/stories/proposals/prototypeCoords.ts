// Prototype coordinate spaces for the periodic-table layouts proposal
// (#1347). Throwaway: plain `CoordinateTransform` records, not added to the
// library or the IR.
//
// `spiral` uses the polar budget rule (no `fit`), so it lays out ordinal
// content (a `table`) as `Coord.clock()` does. `along` has a `fit`, in the
// manner of `geo`: its budget is its data window, so its content must carry
// continuous positions (a `scatter`). See the WALL notes for why the two
// differ.

import type { CoordinateTransform } from "../../src/ast/coordinateTransforms/coord";

export type Pt = [number, number];

// ─── spiral ────────────────────────────────────────────────────────────────

export type SpiralOptions = {
  /**
   * How far the radius grows per full turn, as a fraction of the radial
   * budget (the room the content's r axis lays out in). A grid of n rows
   * that each run one full turn winds row into row at `pitch: 1 / n`.
   */
  pitch: number;
  /**
   * EMULATION: the outer radius in pixels the coord will lay out in, that
   * is min(w, h) / 2 - padding. WALL: without `fit`, a transform is never
   * told its budget (coord.tsx:385-402 computes it and keeps it), so a pitch
   * relative to the budget needs it passed in by hand. And `fit` cannot be
   * used instead: see `AlongOptions.x`.
   */
  outerRadius: number;
  /** The hole in the middle, as a fraction of the outer radius. Default 0. */
  innerRadius?: number;
  /** How many turns the angular axis spans: its budget is 2π · turns.
   *  Default 1. */
  turns?: number;
  /** Where θ = 0 is, radians counter-clockwise from 3 o'clock. Default π/2
   *  (12 o'clock). */
  start?: number;
  /** +1 counter-clockwise, -1 clockwise. Default -1. */
  direction?: 1 | -1;
};

/**
 * A polar space whose radius grows with the angle: (θ, r) goes to the polar
 * point at angle θ and radius r + pitch · R · θ / 2π, with R the radial
 * budget. A row of a grid that runs one full turn ends where the next row
 * starts. The whole map is shrunk so the far end of the last turn, which
 * reaches pitch · R past the budget, stays inside the box.
 */
export const spiral = (opts: SpiralOptions): CoordinateTransform => {
  const {
    pitch,
    outerRadius: outer,
    innerRadius = 0,
    turns = 1,
    start = Math.PI / 2,
    direction = -1,
  } = opts;
  const thetaBudget = 2 * Math.PI * turns;
  const hole = innerRadius * outer;
  const R = outer - hole; // the radial budget the polar rule hands out
  const grow = pitch * R; // radius gained per turn
  const k = outer / (outer + grow * turns);
  return {
    type: "spiral",
    aliases: { x: "theta", y: "r" },
    // Not `polar: true`: that flag turns on polar-only geometry (petals,
    // the center point in the bbox) that a spiral does not share. And no
    // `HasCycle` on θ: θ and θ + 2π are different points of a spiral.
    axisTraits: [{}, { HasZero: {} }],
    // The coord adds the hole to r before calling `transform`
    // (coord.tsx:394-400).
    innerRadius,
    transform: ([theta, r]) => {
      const radius = k * (r + (grow * theta) / (2 * Math.PI));
      return [
        radius * Math.cos(start + direction * theta),
        radius * Math.sin(start + direction * theta),
      ];
    },
    domain: [
      { min: 0, max: thetaBudget, size: thetaBudget },
      { min: 0, max: 100, size: 100 },
    ],
  };
};

// ─── spiral, fix 1: pitch in data units ────────────────────────────────────

/**
 * Proposed `Coord.spiral({ pitch: 1 })`: the radius advances `pitch` units
 * of the radial axis (rows of a table, spacing included) per turn of the
 * angular axis. EMULATION: the coord runs after the layout and sees only
 * pixels, so this works the fraction of the budget out by hand from what
 * the table will do: `rows` bands of equal height with `spacing` pixels
 * between them, in a radial budget R = outerRadius · (1 - innerRadius). One
 * row plus one gap is (R + spacing) / rows pixels.
 */
export const spiralRows = (
  opts: Omit<SpiralOptions, "pitch"> & {
    pitch?: number;
    rows: number;
    spacing: number;
  }
): CoordinateTransform => {
  const { pitch = 1, rows, spacing, ...rest } = opts;
  const R = rest.outerRadius * (1 - (rest.innerRadius ?? 0));
  return spiral({ ...rest, pitch: (pitch * (R + spacing)) / (rows * R) });
};

// ─── spiral, fix 2: one sequence axis and a period ─────────────────────────

export type SpiralPeriodOptions = {
  /** Data units of the angular axis per turn. */
  period: number;
  /** Empty space between one turn's band and the next, as a fraction of
   *  the band. Default 0. */
  gap?: number;
  /** The hole in the middle, in bands. Default 0. */
  innerRadius?: number;
  /** The data window along the spiral. EMULATION: the coord needs it to
   *  know how many turns there are (to size the box); see `AlongOptions.x`
   *  for why a fitted space needs a declared window at all. */
  x: [number, number];
  /** The data window across the band: the band is the radial axis's full
   *  extent, so the radius grows by exactly this extent (plus the gap) per
   *  turn and turns touch by construction. */
  y: [number, number];
};

/**
 * Proposed `Coord.spiral({ period: 32 })`: x goes round, `period` units per
 * turn, clockwise from 12 o'clock; y is the band's thickness, and the band
 * of each turn sits on the one before it. A fitted space, like `along`: its
 * budget is its data window.
 */
export const spiralPeriod = (opts: SpiralPeriodOptions): CoordinateTransform => {
  const { period, gap = 0, innerRadius = 0, x: xWin, y: yWin } = opts;
  const xSpan = xWin[1] - xWin[0];
  const ySpan = yWin[1] - yWin[0];
  const turns = xSpan / period;
  // In band units: the far edge of the last turn.
  const maxR = innerRadius + (1 + gap) * turns + 1;
  const window = (w: [number, number]) => ({
    min: w[0],
    max: w[1],
    size: w[1] - w[0],
  });
  return {
    type: "spiralPeriod",
    aliases: { x: "theta", y: "r" },
    dataWindow: [window(xWin), window(yWin)] as any,
    transform: (p) => p,
    domain: [window(xWin), window(yWin)],
    fit: ({ size, padding }) => {
      const scale =
        Math.min(size[0] - 2 * padding, size[1] - 2 * padding) / (2 * maxR);
      return {
        budget: [xSpan, ySpan],
        transform: ([u, v]) => {
          const turn = u / period;
          const r = (innerRadius + (1 + gap) * turn + v / ySpan) * scale;
          const a = Math.PI / 2 - 2 * Math.PI * turn;
          return [maxR * scale + r * Math.cos(a), maxR * scale + r * Math.sin(a)];
        },
        extent: { width: 2 * maxR * scale, height: 2 * maxR * scale },
      };
    },
  };
};

// ─── along ─────────────────────────────────────────────────────────────────

/**
 * One piece of a guide made of several paths. The pieces share the x axis
 * in order: the first hosts the first `span` units of the x window, the next
 * the following `span` units, and so on.
 */
export type Piece = {
  /**
   * The piece's path. EMULATION (Benfey only): a function of the offset
   * across the band, in path units, gives the tracks of one piece different
   * paths. See `benfeyGuide` for why its d piece needs it.
   */
  path: Pt[] | ((offset: number) => Pt[]);
  /** How many units of x the piece hosts (for a table, its columns). */
  span: number;
  /** How far across the band the piece's content reaches, in path units,
   *  for the fitted box. Default: the band's full `width`. */
  depth?: number;
  /** Join the path's last point back to its first. Default false. */
  closed?: boolean;
};

export type AlongOptions = {
  /** Join the last point back to the first (single path only). Default
   *  false. */
  closed?: boolean;
  /** The band's thickness across the path, in the path's own units. The
   *  band runs from the path (y at its low end) to the left of the
   *  direction of travel. */
  width: number;
  /**
   * The data window along the path: its low end is the path's start and its
   * high end the path's end (for a list of pieces, the last piece's end).
   * WALL: a fitted space's budget is its data window (coord.tsx:356-373), so
   * it needs one on each axis, and ordinal content (`table`, `spread`) has
   * none: the coord throws. Declaring a dummy window to get past that makes
   * ordinal content collapse instead, every column on top of the others
   * (coord.tsx:430-433 takes the claim from `impliedExtent`, which is
   * undefined for an ordinal axis).
   */
  x: [number, number];
  /** The data window across the band: low end on the path, high end at
   *  `width` from it. */
  y: [number, number];
};

/**
 * A polyline stroked as a band with miter joins: the point at arc length s
 * along the path and offset d across it lies on the segment that holds s,
 * between that segment's two end miter lines moved out by d. On a densely
 * sampled curve the miters are the normals, so this is the usual normal
 * offset. At a sharp corner the offsets meet on the corner's bisector, so a
 * concave corner shortens the far tracks instead of folding them back over
 * each other, as long as each segment is longer than d · tan(turn / 2) at
 * each concave end.
 */
export const miterBand = (pts: Pt[], closed: boolean) => {
  // Drop repeated points: a zero-length segment has no direction.
  const Q: Pt[] = pts.filter(
    (p, i) =>
      i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-9
  );
  const P = closed ? [...Q, Q[0]] : Q;
  const m = P.length - 1; // segments
  const cum = [0];
  const segN: Pt[] = [];
  for (let i = 0; i < m; i++) {
    const dx = P[i + 1][0] - P[i][0];
    const dy = P[i + 1][1] - P[i][1];
    const len = Math.hypot(dx, dy);
    cum.push(cum[i] + len);
    // Left normal of the direction of travel (the plane is y-up).
    segN.push([-dy / len, dx / len]);
  }
  const L = cum[m];
  const miter = (a: Pt, b: Pt): Pt => {
    const k = 1 + a[0] * b[0] + a[1] * b[1];
    return k < 1e-6 ? b : [(a[0] + b[0]) / k, (a[1] + b[1]) / k];
  };
  const M: Pt[] = P.map((_, i) => {
    if (i === 0) return closed ? miter(segN[m - 1], segN[0]) : segN[0];
    if (i === m) return closed ? miter(segN[m - 1], segN[0]) : segN[m - 1];
    return miter(segN[i - 1], segN[i]);
  });
  const at = (s: number, d: number): Pt => {
    if (closed) s = ((s % L) + L) % L;
    const sc = Math.max(0, Math.min(L, s));
    let lo = 0;
    let hi = m;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= sc) lo = mid;
      else hi = mid;
    }
    // t may run past [0, 1] at an open end.
    const t = (s - cum[lo]) / (cum[hi] - cum[lo]);
    const a: Pt = [P[lo][0] + d * M[lo][0], P[lo][1] + d * M[lo][1]];
    const b: Pt = [P[hi][0] + d * M[hi][0], P[hi][1] + d * M[hi][1]];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  return { L, at };
};

const isPieces = (p: Pt[] | Piece[]): p is Piece[] =>
  p.length > 0 && !Array.isArray(p[0]);

/**
 * A band along a path: (x, y) goes to the point at arc length x along the
 * path, moved y across it (to the left of travel). Its budget is its data
 * window, as `geo`'s is, so a literal size inside it is in data units:
 * `w: v(1)` is one unit of x along the path. The path is a list of points
 * (`along(archimedean({ ... }), { ... })`) or a list of pieces that each
 * host a run of x (`along([piece, piece], { ... })`).
 */
export const along = (
  path: Pt[] | Piece[],
  opts: AlongOptions
): CoordinateTransform => {
  const { closed = false, width, x: xWin, y: yWin } = opts;
  const xSpan = xWin[1] - xWin[0];
  const ySpan = yWin[1] - yWin[0];
  const pieces: Piece[] = isPieces(path)
    ? path
    : [{ path, span: xSpan, closed }];
  const starts: number[] = [];
  pieces.reduce((acc, p) => (starts.push(acc), acc + p.span), xWin[0]);
  const pathAt = (p: Piece, offset: number) =>
    typeof p.path === "function" ? p.path(offset) : p.path;
  // The fitted box: every piece's band, from the path out to its depth.
  const bx: number[] = [];
  const by: number[] = [];
  for (const p of pieces) {
    const depth = p.depth ?? width;
    for (const d of [0, depth]) {
      const band = miterBand(pathAt(p, d), p.closed ?? false);
      const n = 400;
      for (let i = 0; i <= n; i++) {
        const [x, y] = band.at((i / n) * band.L, d);
        bx.push(x);
        by.push(y);
      }
    }
  }
  const box = {
    minX: Math.min(...bx),
    maxX: Math.max(...bx),
    minY: Math.min(...by),
    maxY: Math.max(...by),
  };
  const window = (w: [number, number]) => ({
    min: w[0],
    max: w[1],
    size: w[1] - w[0],
  });
  return {
    type: "along",
    aliases: { x: "along", y: "across" },
    dataWindow: [window(xWin), window(yWin)] as any,
    // Used only before `fit` runs.
    transform: (p) => p,
    domain: [window(xWin), window(yWin)],
    fit: ({ size, padding }) => {
      const scale = Math.min(
        Math.max(size[0] - 2 * padding, 1) / (box.maxX - box.minX),
        Math.max(size[1] - 2 * padding, 1) / (box.maxY - box.minY)
      );
      const toBox = (pts: Pt[]): Pt[] =>
        pts.map(([x, y]) => [(x - box.minX) * scale, (y - box.minY) * scale]);
      // One band per path array, made once.
      const bands = new Map<Pt[], ReturnType<typeof miterBand>>();
      const bandOf = (p: Piece, offset: number) => {
        const raw = pathAt(p, offset);
        let b = bands.get(raw);
        if (!b) {
          b = miterBand(toBox(raw), p.closed ?? false);
          bands.set(raw, b);
        }
        return b;
      };
      return {
        budget: [xSpan, ySpan],
        transform: ([u, v]) => {
          const x = u + xWin[0];
          let i = pieces.length - 1;
          while (i > 0 && x < starts[i]) i--;
          const p = pieces[i];
          const offset = (v / ySpan) * width; // path units
          const band = bandOf(p, offset);
          return band.at(((x - starts[i]) / p.span) * band.L, offset * scale);
        },
        extent: {
          width: (box.maxX - box.minX) * scale,
          height: (box.maxY - box.minY) * scale,
        },
      };
    },
  };
};

// ─── path builders ─────────────────────────────────────────────────────────

/**
 * Points along an Archimedean spiral r = innerRadius + pitch · θ / 2π,
 * running outward clockwise from 12 o'clock, `samplesPerTurn` per turn, so
 * the left normal of its travel points outward. Units are arbitrary
 * (`along` scales the path to fit).
 */
export const archimedean = ({
  turns,
  pitch = 1,
  innerRadius = 0,
  samplesPerTurn = 120,
}: {
  turns: number;
  pitch?: number;
  innerRadius?: number;
  samplesPerTurn?: number;
}): Pt[] => {
  const n = Math.ceil(turns * samplesPerTurn);
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const theta = (2 * Math.PI * turns * i) / n;
    const r = innerRadius + (pitch * theta) / (2 * Math.PI);
    pts.push([
      r * Math.cos(Math.PI / 2 - theta),
      r * Math.sin(Math.PI / 2 - theta),
    ]);
  }
  return pts;
};

/**
 * A race-track (stadium) outline: two straights joined by two semicircles,
 * `w` by `h` overall, run clockwise from the middle of the top straight, so
 * its left normal points outward. Pass `closed: true` to `along`.
 */
export const stadium = ({
  w,
  h,
  samplesPerEnd = 60,
}: {
  w: number;
  h: number;
  samplesPerEnd?: number;
}): Pt[] => {
  const r = h / 2;
  const half = w / 2 - r; // half the straight's length
  const pts: Pt[] = [];
  // Top straight, left to right, from the middle.
  pts.push([0, r], [half, r]);
  // Right end, clockwise from the top.
  for (let i = 1; i < samplesPerEnd; i++) {
    const a = Math.PI / 2 - (Math.PI * i) / samplesPerEnd;
    pts.push([half + r * Math.cos(a), r * Math.sin(a)]);
  }
  pts.push([half, -r], [-half, -r]);
  // Left end, clockwise from the bottom.
  for (let i = 1; i < samplesPerEnd; i++) {
    const a = -Math.PI / 2 - (Math.PI * i) / samplesPerEnd;
    pts.push([-half + r * Math.cos(a), r * Math.sin(a)]);
  }
  pts.push([-half, r]);
  return pts;
};

/** A point at radius r and angle phi, in degrees clockwise from 12 o'clock
 *  (y-up). */
export const clockPt = (r: number, phi: number): Pt => [
  r * Math.sin((phi * Math.PI) / 180),
  r * Math.cos((phi * Math.PI) / 180),
];

/** A clockwise arc around the origin at radius r from angle a to b
 *  (degrees clockwise from 12 o'clock), so its left normal points out. */
export const clockArc = (r: number, a: number, b: number, perDeg = 1): Pt[] => {
  const n = Math.max(2, Math.ceil(Math.abs(b - a) * perDeg));
  return Array.from({ length: n + 1 }, (_, i) => clockPt(r, a + ((b - a) * i) / n));
};

/**
 * Copied from the stacking design-space prototype (stackingKinds.ts, k3), with
 * a radius per corner (0 keeps the corner sharp). A polyline with each
 * corner rounded by a circular arc (shrunk where a segment is too short).
 */
export const fillet = (pts: Pt[], radii: number[], step = 0.05): Pt[] => {
  const norm = ([x, y]: Pt): Pt => {
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  const out: Pt[] = [pts[0]];
  let cur = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const r = radii[i - 1] ?? 0;
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    if (r <= 0) {
      out.push(b);
      cur = b;
      continue;
    }
    const u = norm([b[0] - a[0], b[1] - a[1]]);
    const v = norm([c[0] - b[0], c[1] - b[1]]);
    const turn = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])));
    const lenAB = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const lenBC = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const d = Math.min(r * Math.tan(turn / 2), lenAB / 2, lenBC / 2);
    const rr = d / Math.tan(turn / 2);
    const start: Pt = [b[0] - u[0] * d, b[1] - u[1] * d];
    out.push(start);
    // The arc's center is on the inside of the turn.
    const side = Math.sign(u[0] * v[1] - u[1] * v[0]) || 1;
    const cx = start[0] - side * u[1] * rr;
    const cy = start[1] + side * u[0] * rr;
    const a0 = Math.atan2(start[1] - cy, start[0] - cx);
    const n = Math.max(2, Math.ceil((rr * turn) / step));
    for (let k = 1; k <= n; k++) {
      const ang = a0 + (side * turn * k) / n;
      out.push([cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)]);
    }
    cur = out[out.length - 1];
  }
  void cur;
  out.push(pts[pts.length - 1]);
  return out;
};
