/**
 * THROWAWAY data and helpers for the stacking-kinds proposal. Everything here
 * emulates in plain JS what a stack of strokes, a contact stack, a normal
 * stack or an area stack would do if GoFish had it.
 */

/** Pixels: these stories fix the y scale at one data unit per pixel. */
export const PX = 1;

// ---------------------------------------------------------------------------
// 3. Lines stacked by their strokes.

export const LINE_WIDTHS: [string, number][] = [
  ["A", 8],
  ["B", 12],
  ["C", 6],
  ["D", 10],
  ["E", 8],
];

/** The shared baseline of the line stack, in pixels (y up). */
const lineBase = (x: number) => 70 + 45 * Math.sin(x / 4.2);
const lineBaseSlope = (x: number) => (45 / 4.2) * Math.cos(x / 4.2);

/**
 * One row per line per x. `"vertical"`: a line's interval is its stroke
 * width, measured vertically. `"section"`: a line's interval is its stroke's
 * vertical cross-section, width / cos(slope), so the strokes touch along the
 * normal. `pxPerX` converts the slope from data units to pixels.
 */
export const lineStack = (
  kind: "vertical" | "section",
  { n = 61, xMax = 30, pxPerX = 480 / 30 } = {}
) =>
  LINE_WIDTHS.flatMap(([c, w], k) =>
    Array.from({ length: n }, (_, i) => {
      const x = (xMax * i) / (n - 1);
      const slope = lineBaseSlope(x) / pxPerX; // pixels of y per pixel of x
      const s = kind === "section" ? Math.sqrt(1 + slope * slope) : 1;
      const below = LINE_WIDTHS.slice(0, k).reduce((t, [, v]) => t + v, 0);
      return { x, y: lineBase(x) + (below + w / 2) * s, c, w };
    })
  );

// ---------------------------------------------------------------------------
// Seeded randomness.

let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const normal = () => {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};
const round = (v: number) => Math.round(v * 1000) / 1000;

// ---------------------------------------------------------------------------
// 4. Contact stacking.

/** 70 values for the dot plots. */
export const dotValues: { id: number; v: number }[] = Array.from(
  { length: 70 },
  (_, id) => ({ id, v: round(5 + 1.6 * normal()) })
);

/** Circles of varied radius in five clusters, for the dodge. `r` is in
 *  pixels; each cluster's values spread about half a unit around its
 *  center `gv`. */
export const dodgeDots: {
  id: number;
  v: number;
  r: number;
  g: number;
  gv: number;
}[] = [0, 1, 2, 3, 4].flatMap((g) =>
  Array.from({ length: 6 + g }, (_, i) => ({
    id: g * 100 + i,
    g,
    gv: 2 + 4 * g,
    v: round(2 + 4 * g + 0.5 * normal()),
    r: round(4 + 10 * rand()),
  }))
);

/** Five groups whose means drift right, 40 values each. */
export const RIDGES = ["Jan", "Mar", "May", "Jul", "Sep"];
const ridgeSamples = RIDGES.flatMap((c, k) =>
  Array.from({ length: 40 }, () => ({
    c,
    v: round(
      k === 2 && rand() < 0.5 ? 1.5 + 0.6 * normal() : 2 + 1.4 * k + 0.7 * normal()
    ),
  }))
);

/** A Gaussian KDE per ridge on one shared grid, trimmed to where it is above
 *  3% of its peak: each ridge's support, so its lower outline has ends. */
const ridgeDensities = (() => {
  const vs = ridgeSamples.map((r) => r.v);
  const [lo, hi] = [Math.min(...vs) - 1, Math.max(...vs) + 1];
  const n = 160;
  const grid = Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
  return RIDGES.map((c) => {
    const xs = ridgeSamples.filter((r) => r.c === c).map((r) => r.v);
    const bw = 0.45;
    const d = grid.map(
      (x) =>
        xs.reduce((s, v) => s + Math.exp(-0.5 * ((x - v) / bw) ** 2), 0) /
        (xs.length * bw * Math.sqrt(2 * Math.PI))
    );
    const peak = Math.max(...d);
    return { c, pts: grid.map((x, i) => ({ x, d: d[i] })), peak };
  });
})();
const inSupport = (r: (typeof ridgeDensities)[0]) =>
  r.pts.filter((p) => p.d >= 0.03 * r.peak);

export type RidgeRow = { x: number; y0: number; y1: number; c: string };

/**
 * Ridgeline rows, bottom ridge first, each row one point of one ridge with
 * its band [y0, y1]. `"fixed"`: ridge k at k times a fixed step. `"contact"`:
 * each ridge raised just until its lower outline (the flat baseline over its
 * support) touches the upper outline of the ridges below. `"sum"`: the
 * stacked density, on the full grid.
 */
export const ridgeRows = (kind: "fixed" | "contact" | "sum"): RidgeRow[] => {
  if (kind === "sum") {
    const n = ridgeDensities[0].pts.length;
    const acc = new Array(n).fill(0);
    return ridgeDensities.flatMap((r) =>
      r.pts.map((p, i) => {
        const y0 = acc[i];
        acc[i] += p.d;
        return { x: p.x, y0, y1: acc[i], c: r.c };
      })
    );
  }
  const step = 0.45 * Math.max(...ridgeDensities.map((r) => r.peak));
  // The upper outline of everything placed so far, on the shared grid.
  const top = new Map<number, number>();
  return ridgeDensities.flatMap((r, k) => {
    const pts = inSupport(r);
    const offset =
      kind === "fixed"
        ? k * step
        : k === 0
          ? 0
          : Math.max(0, ...pts.map((p) => top.get(p.x) ?? 0));
    for (const p of pts)
      top.set(p.x, Math.max(top.get(p.x) ?? 0, offset + p.d));
    return pts.map((p) => ({ x: p.x, y0: offset, y1: offset + p.d, c: r.c }));
  });
};

// ---------------------------------------------------------------------------
// 5. A sankey link, stacked along its normal or vertically. Pixels, y up.

export const LINK = { x0: 160, y0: 215, x1: 320, y1: 45, width: 40 };

/** d3-sankey's linkHorizontal: a cubic with horizontal tangents at both
 *  ends, read at t. Returns the point and the unit normal (pointing up-left
 *  of the direction of travel). */
const linkAt = (t: number) => {
  const { x0, y0, x1, y1 } = LINK;
  const xm = (x0 + x1) / 2;
  const u = 1 - t;
  const x = u * u * u * x0 + 3 * u * u * t * xm + 3 * u * t * t * xm + t * t * t * x1;
  const y = u * u * u * y0 + 3 * u * u * t * y0 + 3 * u * t * t * y1 + t * t * t * y1;
  const dx = 3 * u * u * (xm - x0) + 3 * t * t * (x1 - xm);
  const dy = 6 * u * t * (y1 - y0);
  const len = Math.hypot(dx, dy);
  return { x, y, nx: -dy / len, ny: dx / len };
};

const T = Array.from({ length: 121 }, (_, i) => i / 120);

/** The link's centerline, for a stroke. */
export const linkCenter = T.map((t, i) => {
  const p = linkAt(t);
  return { i, x: p.x, y: p.y };
});

/** Strands of the given widths, centered on the link, as polygons offset
 *  along the normal (`"normal"`) or as bands offset vertically at each x
 *  (`"vertical"`). */
export const strands = (widths: number[], kind: "normal" | "vertical") => {
  const total = widths.reduce((s, w) => s + w, 0);
  let below = -total / 2;
  return widths.map((w, k) => {
    const [a, b] = [below, below + w];
    below = b;
    const side = (o: number) =>
      T.map((t): [number, number] => {
        const p = linkAt(t);
        return kind === "normal"
          ? [p.x + o * p.nx, p.y + o * p.ny]
          : [p.x, p.y + o];
      });
    return { c: `s${k}`, ring: [...side(a), ...side(b).reverse()] };
  });
};

/** The two nodes the link joins, as boxes. */
export const linkNodes = [
  { c: "node", ring: box(LINK.x0 - 16, LINK.x0, LINK.y0 - 32, LINK.y0 + 32) },
  { c: "node", ring: box(LINK.x1, LINK.x1 + 16, LINK.y1 - 32, LINK.y1 + 32) },
];
function box(x0: number, x1: number, y0: number, y1: number): [number, number][] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

// ---------------------------------------------------------------------------
// 6. Concentric rings: the amounts add as areas or as radii.

export const RINGS = [
  { c: "a", amount: 30 },
  { c: "b", amount: 50 },
  { c: "c", amount: 20 },
];

/** Each ring's radial thickness `dr`: `"area"` makes ring k's area its
 *  amount (r_k = sqrt(S_k / pi)); `"radius"` makes its thickness its amount. */
export const ringRows = (kind: "area" | "radius", outerPx = 110) => {
  let sum = 0;
  let r = 0;
  const rows = RINGS.map(({ c, amount }) => {
    sum += amount;
    const next = kind === "area" ? Math.sqrt(sum / Math.PI) : sum;
    const dr = next - r;
    r = next;
    return { c, amount, one: 1, dr: round(dr), r: round(r) };
  });
  // Pixels, with the outer radius at `outerPx`: a spread of pixel heights
  // stands in for a radial data scale.
  return rows.map((row) => ({ ...row, px: round((row.dr / r) * outerPx) }));
};

// ===========================================================================
// k3: routing paths. Everything below is in pixels (y up) and drawn as
// polygons and polylines in a pixel frame: GoFish has no path-offset or
// B-spline primitive, so the geometry is computed here.

type Pt = [number, number];

/** A sampled path: points with unit tangent, left unit normal and arc
 *  length. */
export type PathSample = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  s: number;
};

/** Samples from a dense point list: tangents by central differences, arc
 *  length by summing chords. */
const sample = (pts: Pt[]): PathSample[] => {
  let s = 0;
  return pts.map(([x, y], i) => {
    if (i > 0) s += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
    const [ax, ay] = pts[Math.max(0, i - 1)];
    const [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const [tx, ty] = [(bx - ax) / len, (by - ay) / len];
    return { x, y, tx, ty, nx: -ty, ny: tx, s };
  });
};

/** A cubic Bezier sampled at n + 1 points. */
const cubic = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 160): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    const b = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return [
      b[0] * p0[0] + b[1] * p1[0] + b[2] * p2[0] + b[3] * p3[0],
      b[0] * p0[1] + b[1] * p1[1] + b[2] * p2[1] + b[3] * p3[1],
    ];
  });

/** d3-sankey's link shape: a cubic with horizontal tangents at both ends. */
const hlink = (a: Pt, b: Pt): Pt[] => {
  const xm = (a[0] + b[0]) / 2;
  return cubic(a, [xm, a[1]], [xm, b[1]], b);
};

function norm([x, y]: Pt): Pt {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

/** A polyline with each corner rounded by a circular arc of radius r (the
 *  arc is shrunk where a segment is too short for it). */
const fillet = (pts: Pt[], r: number, step = 2): Pt[] => {
  const out: Pt[] = [pts[0]];
  const line = (a: Pt, b: Pt) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let i = 1; i <= n; i++)
      out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  };
  let cur = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    const u = norm([b[0] - a[0], b[1] - a[1]]);
    const v = norm([c[0] - b[0], c[1] - b[1]]);
    const turn = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])));
    const lenAB = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const lenBC = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const d = Math.min(r * Math.tan(turn / 2), lenAB / 2, lenBC / 2);
    const rr = d / Math.tan(turn / 2);
    const start: Pt = [b[0] - u[0] * d, b[1] - u[1] * d];
    line(cur, start);
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
  line(cur, pts[pts.length - 1]);
  return out;
};

/** A band along a path between normal offsets lo(s) and hi(s) (s = arc
 *  length), as a closed ring. */
const bandAlong = (
  path: PathSample[],
  lo: (s: number) => number,
  hi: (s: number) => number
): Pt[] => [
  ...path.map((p): Pt => [p.x + lo(p.s) * p.nx, p.y + lo(p.s) * p.ny]),
  ...path
    .map((p): Pt => [p.x + hi(p.s) * p.nx, p.y + hi(p.s) * p.ny])
    .reverse(),
];

/** One edge of a band, as polyline rows {i, x, y}. */
const edgeAlong = (path: PathSample[], o: (s: number) => number) =>
  path.map((p, i) => ({ i, x: p.x + o(p.s) * p.nx, y: p.y + o(p.s) * p.ny }));

/** Strands of the given widths stacked along a path's normal, centered on
 *  it: ring k covers [below_k, below_k + w_k] across the path. */
const strandsAlong = (path: PathSample[], widths: number[], cs?: string[]) => {
  const total = widths.reduce((s, w) => s + w, 0);
  let below = -total / 2;
  return widths.map((w, k) => {
    const a = below;
    below += w;
    return {
      c: cs?.[k] ?? `s${k}`,
      ring: bandAlong(path, () => a, () => a + w),
    };
  });
};

const boxRing = (cx: number, cy: number, w: number, h: number) => ({
  c: "node",
  ring: box(cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2),
});

// ---------------------------------------------------------------------------
// k3-1. Hierarchical edge bundling (Holten 2006).

/** 4 groups of 5 leaves on a circle, with a gap of one slot between groups.
 *  Angles in radians, counter-clockwise from 3 o'clock. */
const HEB_GROUPS = 4;
const HEB_LEAVES = 5;
const slot = (2 * Math.PI) / (HEB_GROUPS * (HEB_LEAVES + 1));
const leafAngle = (g: number, i: number) =>
  slot * (g * (HEB_LEAVES + 1) + i + 0.5);
const groupAngle = (g: number) => leafAngle(g, (HEB_LEAVES - 1) / 2);

/** Fifteen edges between leaves in different groups (seeded). */
const hebEdges = (() => {
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const out: { id: number; a: [number, number]; b: [number, number] }[] = [];
  while (out.length < 15) {
    const ga = Math.floor(r() * HEB_GROUPS);
    const gb = Math.floor(r() * HEB_GROUPS);
    const ia = Math.floor(r() * HEB_LEAVES);
    const ib = Math.floor(r() * HEB_LEAVES);
    if (ga !== gb) out.push({ id: out.length, a: [ga, ia], b: [gb, ib] });
  }
  return out;
})();

/** Uniform cubic B-spline over control points, with the end points tripled
 *  so the curve starts and ends on them (d3's curveBasis). */
const bspline = (P: Pt[], perSeg = 24): Pt[] => {
  const Q = [P[0], P[0], ...P, P[P.length - 1], P[P.length - 1]];
  const out: Pt[] = [];
  for (let i = 0; i + 3 < Q.length; i++) {
    const last = i + 4 === Q.length;
    for (let k = 0; k <= (last ? perSeg : perSeg - 1); k++) {
      const t = k / perSeg;
      const b = [
        (1 - t) ** 3 / 6,
        (3 * t ** 3 - 6 * t ** 2 + 4) / 6,
        (-3 * t ** 3 + 3 * t ** 2 + 3 * t + 1) / 6,
        t ** 3 / 6,
      ];
      out.push([
        b[0] * Q[i][0] + b[1] * Q[i + 1][0] + b[2] * Q[i + 2][0] + b[3] * Q[i + 3][0],
        b[0] * Q[i][1] + b[1] * Q[i + 1][1] + b[2] * Q[i + 2][1] + b[3] * Q[i + 3][1],
      ]);
    }
  }
  return out;
};

/** Holten's straightening: P'_i = beta P_i + (1 - beta) of the chord. */
const straighten = (P: Pt[], beta: number): Pt[] => {
  const [a, b] = [P[0], P[P.length - 1]];
  return P.map(([x, y], i) => {
    const f = i / (P.length - 1);
    return [
      beta * x + (1 - beta) * (a[0] + f * (b[0] - a[0])),
      beta * y + (1 - beta) * (a[1] + f * (b[1] - a[1])),
    ];
  });
};

/**
 * One polyline per edge, as rows {e, g, i, x, y} in pixels, in a size by
 * size frame. The control points are the tree path leaf, group, root,
 * group, leaf, with leaves at radius 1, groups at 1/2 and the root at 0.
 * `"screen"`: the points are mapped to the plane first, then straightened
 * and splined there (d3's convention). `"polar"`: they are straightened and
 * splined in (angle, radius), then mapped, so the curve bends with the
 * polar space. The root has no angle; in `"polar"` it takes the angle
 * halfway between the two groups, the short way round.
 */
export const hebRows = (
  beta: number,
  kind: "screen" | "polar",
  size = 300
) => {
  const R = size / 2 - 22;
  const toPx = ([th, r]: Pt): Pt => [
    size / 2 + R * r * Math.cos(th),
    size / 2 + R * r * Math.sin(th),
  ];
  return hebEdges.flatMap(({ id, a, b }) => {
    const tA = leafAngle(...a);
    const gA = groupAngle(a[0]);
    let gB = groupAngle(b[0]);
    let tB = leafAngle(...b);
    // Unwrap so the path goes the short way round from group A to group B.
    const turn = Math.round((gB - gA) / (2 * Math.PI)) * 2 * Math.PI;
    gB -= turn;
    tB -= turn;
    const polarPts: Pt[] = [
      [tA, 1],
      [gA, 0.5],
      [(gA + gB) / 2, 0],
      [gB, 0.5],
      [tB, 1],
    ];
    const pts =
      kind === "screen"
        ? bspline(straighten(polarPts.map(toPx), beta))
        : bspline(straighten(polarPts, beta)).map(toPx);
    return pts.map(([x, y], i) => ({ e: id, g: `g${a[0]}`, i, x, y }));
  });
};

/** The `"polar"` splines in (angle, radius) data, unmapped, for a line in
 *  `Coord.polar`. Angles are unwrapped, so some run below 0 or past 2 pi. */
export const hebPolarData = (beta: number) =>
  hebEdges.flatMap(({ id, a, b }) => {
    const tA = leafAngle(...a);
    const gA = groupAngle(a[0]);
    const turn =
      Math.round((groupAngle(b[0]) - gA) / (2 * Math.PI)) * 2 * Math.PI;
    const gB = groupAngle(b[0]) - turn;
    const tB = leafAngle(...b) - turn;
    const P: Pt[] = [
      [tA, 1],
      [gA, 0.5],
      [(gA + gB) / 2, 0],
      [gB, 0.5],
      [tB, 1],
    ];
    // Wrapped back into [0, 2 pi) (the polar scale fits the data's angle
    // extent to the circle, so an unwrapped angle would shrink it), with
    // the polyline cut where it crosses the seam.
    let part = 0;
    let prev: number | undefined;
    return bspline(straighten(P, beta)).map(([th, r], i) => {
      const w = ((th % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (prev !== undefined && Math.abs(w - prev) > Math.PI) part++;
      prev = w;
      return { e: `${id}-${part}`, g: `g${a[0]}`, i, th: w, r };
    });
  });

/** The leaves, and the internal nodes (root and groups), in pixels. */
export const hebLeaves = (size = 300) => {
  const R = size / 2 - 22;
  return Array.from({ length: HEB_GROUPS }, (_, g) =>
    Array.from({ length: HEB_LEAVES }, (_, i) => ({
      id: `${g}-${i}`,
      g: `g${g}`,
      x: size / 2 + R * Math.cos(leafAngle(g, i)),
      y: size / 2 + R * Math.sin(leafAngle(g, i)),
    }))
  ).flat();
};
export const hebInternal = (size = 300) => {
  const R = size / 2 - 22;
  return [
    { id: "root", x: size / 2, y: size / 2 },
    ...Array.from({ length: HEB_GROUPS }, (_, g) => ({
      id: `g${g}`,
      x: size / 2 + (R / 2) * Math.cos(groupAngle(g)),
      y: size / 2 + (R / 2) * Math.sin(groupAngle(g)),
    })),
  ];
};

// ---------------------------------------------------------------------------
// k3-2. One sankey link of width 48 split into strands 12, 24, 12.

const LINK3 = {
  a: [160, 250] as Pt,
  b: [320, 50] as Pt,
  widths: [12, 24, 12],
};
const linkPath = sample(hlink(LINK3.a, LINK3.b));

/**
 * The strands of LINK3 as rings. `"separate"`: d3-sankey, each strand its
 * own link from its own y at the source to its own y at the target, drawn
 * as a stroke of its width (a band of its width along its own normal).
 * `"vertical"`: bands offset vertically from one spine. `"normal"`: bands
 * offset along the spine's normal.
 */
export const linkStrands = (kind: "separate" | "vertical" | "normal") => {
  const { a, b, widths } = LINK3;
  if (kind === "normal") return strandsAlong(linkPath, widths);
  const total = widths.reduce((s, w) => s + w, 0);
  let below = -total / 2;
  return widths.map((w, k) => {
    const lo = below;
    below += w;
    if (kind === "vertical")
      return {
        c: `s${k}`,
        ring: [
          ...linkPath.map((p): Pt => [p.x, p.y + lo]),
          ...linkPath.map((p): Pt => [p.x, p.y + lo + w]).reverse(),
        ],
      };
    const mid = lo + w / 2;
    const own = sample(hlink([a[0], a[1] + mid], [b[0], b[1] + mid]));
    return { c: `s${k}`, ring: bandAlong(own, () => -w / 2, () => w / 2) };
  });
};
export const link3Nodes = [
  boxRing(LINK3.a[0] - 8, LINK3.a[1], 16, 72),
  boxRing(LINK3.b[0] + 8, LINK3.b[1], 16, 72),
];

// ---------------------------------------------------------------------------
// k3-3. A Minard band: width varies along arc length, offsets along the
// normal, centered on the route.

const minardRoute = sample(
  fillet(
    [
      [20, 150],
      [110, 195],
      [210, 120],
      [300, 180],
      [380, 115],
      [460, 140],
    ],
    80
  )
);
const minardLen = minardRoute[minardRoute.length - 1].s;
/** Steps of the army's width, as (fraction of the route, width in px),
 *  each eased over 10 px of arc length. */
const MINARD_STEPS: [number, number][] = [
  [0, 60],
  [0.22, 44],
  [0.45, 30],
  [0.66, 18],
  [0.84, 8],
];
const minardW = (s: number) => {
  let w = MINARD_STEPS[0][1];
  for (let k = 1; k < MINARD_STEPS.length; k++) {
    const at = MINARD_STEPS[k][0] * minardLen;
    const f = Math.max(0, Math.min(1, (s - at) / 10 + 0.5));
    w += (MINARD_STEPS[k][1] - MINARD_STEPS[k - 1][1]) * f;
  }
  return w;
};
/** The return band: thinner, centered 46 px to the right of the route. */
const returnW = (s: number) => 4 + 6 * (s / minardLen);
export const minardBands = [
  {
    c: "advance",
    ring: bandAlong(minardRoute, (s) => -minardW(s) / 2, (s) => minardW(s) / 2),
  },
  {
    c: "retreat",
    ring: bandAlong(
      minardRoute,
      (s) => -46 - returnW(s) / 2,
      (s) => -46 + returnW(s) / 2
    ),
  },
];
export const minardCenter = edgeAlong(minardRoute, () => 0);

// ---------------------------------------------------------------------------
// k3-4. A trunk of width 48 splitting into branches of 18 and 30.

const SPLIT = {
  src: [40, 140] as Pt,
  at: [210, 160] as Pt,
  targets: [[440, 50] as Pt, [440, 255] as Pt],
  widths: [18, 30], // bottom strand first
};
const trunkPath = sample(hlink(SPLIT.src, SPLIT.at));

/**
 * The trunk's strands and each branch, as rings. Branch k starts at the
 * center of strand k's interval of the trunk's end. `"match"`: the branch
 * leaves with the trunk's tangent (horizontal), so its first cross-section
 * is strand k's interval exactly. `"mismatch"`: the branch leaves heading
 * straight at its target, so its first cross-section is tilted.
 */
export const splitRings = (kind: "match" | "mismatch") => {
  const { at, targets, widths } = SPLIT;
  const total = widths.reduce((s, w) => s + w, 0);
  const end = trunkPath[trunkPath.length - 1];
  const trunk = strandsAlong(trunkPath, widths, ["b0", "b1"]);
  let below = -total / 2;
  const branches = widths.map((w, k) => {
    const mid = below + w / 2;
    below += w;
    const start: Pt = [at[0] + mid * end.nx, at[1] + mid * end.ny];
    const tgt = targets[k];
    const xm = (start[0] + tgt[0]) / 2;
    const d = norm([tgt[0] - start[0], tgt[1] - start[1]]);
    const L = (tgt[0] - start[0]) / 2;
    const c1: Pt =
      kind === "match"
        ? [xm, start[1]]
        : [start[0] + d[0] * L, start[1] + d[1] * L];
    const path = sample(cubic(start, c1, [xm, tgt[1]], tgt));
    return { c: `b${k}`, ring: bandAlong(path, () => -w / 2, () => w / 2) };
  });
  return [...trunk, ...branches];
};
export const splitNodes = [
  boxRing(SPLIT.src[0] - 8, SPLIT.src[1], 16, 64),
  boxRing(SPLIT.targets[0][0] + 8, SPLIT.targets[0][1], 16, 34),
  boxRing(SPLIT.targets[1][0] + 8, SPLIT.targets[1][1], 16, 46),
];

// ---------------------------------------------------------------------------
// k3-5. A bundle of width 60 along an arch whose tightest bend has radius
// rMin = sigma^2 / h (a Gaussian bump of height h). Below rMin = 30, half
// the width, the inner boundary folds over itself.

const FOLD = { widths: [20, 20, 20], h: 130 };
const archPath = (rMin: number) => {
  const sigma = Math.sqrt(rMin * FOLD.h);
  return sample(
    Array.from({ length: 881 }, (_, i): Pt => {
      const x = 20 + (440 * i) / 880;
      return [x, 70 + FOLD.h * Math.exp(-0.5 * ((x - 240) / sigma) ** 2)];
    })
  );
};
export const foldRings = (rMin: number) =>
  strandsAlong(archPath(rMin), FOLD.widths);
/** The bundle's inner (lower) boundary and its spine, for strokes. */
export const foldInner = (rMin: number) => edgeAlong(archPath(rMin), () => -30);
export const foldSpine = (rMin: number) => edgeAlong(archPath(rMin), () => 0);
