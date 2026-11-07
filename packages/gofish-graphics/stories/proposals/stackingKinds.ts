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
