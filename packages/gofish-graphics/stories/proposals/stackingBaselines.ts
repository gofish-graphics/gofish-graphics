/**
 * THROWAWAY data and helpers for the stacking-baselines proposal. Everything
 * here emulates in plain JS what a stack offset, a stack order, a sampling
 * alignment or a density would do if GoFish had it.
 */
import { channelSpline } from "../../src/spline";

export type Row = { x: number; y: number; c: string };

// ---------------------------------------------------------------------------
// Data: six topics over 30 x positions. Each is a small base plus a few
// Gaussian bumps, so bumps come and go as in a streamgraph of topics.

type Bump = [amp: number, at: number, width: number];
const SERIES: [string, number, Bump[]][] = [
  [
    "Maps",
    0.5,
    [
      [4, 5, 3],
      [2, 22, 4],
    ],
  ],
  [
    "Weather",
    0.3,
    [
      [3, 12, 2.5],
      [5, 26, 3],
    ],
  ],
  ["Sports", 1, [[6, 15, 5]]],
  [
    "Music",
    0.2,
    [
      [3, 2, 2],
      [4, 18, 3],
    ],
  ],
  [
    "Film",
    0.4,
    [
      [5, 9, 3],
      [1.5, 28, 2],
    ],
  ],
  ["Games", 0.1, [[7, 22, 2.5]]],
];
export const NAMES = SERIES.map(([c]) => c);

/** The value of series `c` at any x. */
export const f = (c: string, x: number) => {
  const [, base, bumps] = SERIES.find(([n]) => n === c)!;
  return bumps.reduce(
    (s, [a, at, w]) => s + a * Math.exp(-(((x - at) / w) ** 2)),
    base
  );
};

const round = (v: number) => Math.round(v * 1000) / 1000;
const XS = Array.from({ length: 30 }, (_, i) => i);

/** 6 series x 30 positions, every series at every x. */
export const topics: Row[] = NAMES.flatMap((c) =>
  XS.map((x) => ({ x, y: round(f(c, x)), c }))
);

/** The same with Weather and Games negative, for the diverging offset. */
export const topicsSigned: Row[] = topics.map((r) =>
  r.c === "Weather" || r.c === "Games" ? { ...r, y: -r.y } : r
);

// Sampling variant: three series, each measured at its own x positions.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const jittered = Array.from({ length: 15 }, (_, k) =>
  round(Math.min(29, Math.max(0, 2 * k + 0.6 + (rand() - 0.5) * 1.4)))
);
export const SAMPLED = ["Maps", "Sports", "Games"];
const sampleXs: Record<string, number[]> = {
  Maps: XS, // every 1.0
  Sports: Array.from({ length: 20 }, (_, k) => 1.5 * k), // every 1.5
  Games: jittered, // about every 2, jittered
};
export const sampled: Row[] = SAMPLED.flatMap((c) =>
  sampleXs[c].map((x) => ({ x, y: round(f(c, x)), c }))
);
/** The same rows sorted by x, as a careful user would pass them. */
export const sampledByX = [...sampled].sort((a, b) => a.x - b.x);

// ---------------------------------------------------------------------------
// Stacking, as d3.stack / matplotlib.stackplot do it. Adds y0, y1 to each row.

/** The order of the series at one x, bottom first. */
export type Order = (x: number, at: Map<string, number>) => string[];
export type Offset =
  | "zero"
  | "silhouette"
  | "wiggle"
  | "weightedWiggle"
  | "expand"
  | "diverging";

/** The series in the order they first appear in the data. */
export const orderGiven =
  (rows: Row[]): Order =>
  () => [...new Set(rows.map((r) => r.c))];

/** d3.stackOrderInsideOut: by peak position, alternating bottom and top. */
export const orderInsideOut = (rows: Row[]): Order => {
  const names = [...new Set(rows.map((r) => r.c))];
  const of = (c: string) => rows.filter((r) => r.c === c);
  const peak = (c: string) => of(c).reduce((a, b) => (b.y > a.y ? b : a)).x;
  const sum = (c: string) => of(c).reduce((s, r) => s + r.y, 0);
  const byPeak = [...names].sort((a, b) => peak(a) - peak(b));
  let top = 0;
  let bottom = 0;
  const tops: string[] = [];
  const bottoms: string[] = [];
  for (const c of byPeak) {
    if (top < bottom) ((top += sum(c)), tops.push(c));
    else ((bottom += sum(c)), bottoms.push(c));
  }
  const order = bottoms.reverse().concat(tops);
  return () => order;
};

/** Re-sorted at each x: the largest value at the bottom. */
export const orderRankPerX: Order = (_x, at) =>
  [...at.keys()].sort((a, b) => at.get(b)! - at.get(a)!);

export const stackRows = (
  rows: Row[],
  {
    order = orderGiven(rows),
    offset = "zero",
  }: { order?: Order; offset?: Offset }
): (Row & { y0: number; y1: number })[] => {
  const byX = new Map<number, Map<string, number>>();
  for (const r of rows) {
    if (!byX.has(r.x)) byX.set(r.x, new Map());
    byX.get(r.x)!.set(r.c, r.y);
  }
  const xs = [...byX.keys()].sort((a, b) => a - b);
  // Each x: its series bottom first, with each one's [lo, hi] from 0.
  const slices = xs.map((x) => {
    const at = byX.get(x)!;
    const ord = order(x, at);
    const lo = new Map<string, number>();
    const hi = new Map<string, number>();
    let acc = 0;
    let pos = 0;
    let neg = 0;
    for (const c of ord) {
      const v = at.get(c)!;
      if (offset === "diverging") {
        // d3.stackOffsetDiverging: positives up from 0, negatives down.
        if (v >= 0) (lo.set(c, pos), hi.set(c, (pos += v)));
        else (hi.set(c, neg), lo.set(c, (neg += v)));
      } else (lo.set(c, acc), hi.set(c, (acc += v)));
    }
    return { x, at, ord, lo, hi, total: acc };
  });
  // The baseline at each x.
  const g = slices.map(() => 0);
  if (offset === "silhouette") slices.forEach((s, j) => (g[j] = -s.total / 2));
  if (offset === "wiggle") {
    // d3.stackOffsetWiggle, written with each band's middle so that it also
    // reads an order that changes per x. For a fixed order it is d3's sum.
    let y = 0;
    for (let j = 1; j < slices.length; j++) {
      const [p, s] = [slices[j - 1], slices[j]];
      let s1 = 0;
      let s2 = 0;
      for (const c of s.ord) {
        const mid = (sl: typeof s) => (sl.lo.get(c)! + sl.hi.get(c)!) / 2;
        s1 += s.at.get(c)!;
        s2 += (mid(s) - mid(p)) * s.at.get(c)!;
      }
      if (s1) y -= s2 / s1;
      g[j] = y;
    }
  }
  if (offset === "weightedWiggle") {
    // matplotlib.stackplot(baseline="weighted_wiggle"), Byron and
    // Wattenberg 2008. below_size is the size above a band plus half of it.
    let center = 0;
    for (let j = 0; j < slices.length; j++) {
      const s = slices[j];
      const inv = s.total > 0 ? 1 / s.total : 0;
      let sum = 0;
      for (const c of s.ord) {
        const y = s.at.get(c)!;
        const increase = j === 0 ? y : y - slices[j - 1].at.get(c)!;
        const moveUp = j === 0 ? 0.5 : (s.total - s.hi.get(c)! + 0.5 * y) * inv;
        sum += (moveUp - 0.5) * increase;
      }
      center += sum;
      g[j] = center - 0.5 * s.total;
    }
  }
  // Rows come out grouped by series in the input's order, so the color
  // scale (which takes values in order of appearance) is the same whatever
  // the stack order.
  const names = [...new Set(rows.map((r) => r.c))];
  const rank = (r: Row) => names.indexOf(r.c);
  return slices
    .flatMap((s, j) => {
      const k = offset === "expand" && s.total ? 1 / s.total : 1;
      return s.ord.map((c) => ({
        x: s.x,
        y: s.at.get(c)!,
        c,
        y0: g[j] + s.lo.get(c)! * k,
        y1: g[j] + s.hi.get(c)! * k,
      }));
    })
    .sort((a, b) => rank(a) - rank(b) || a.x - b.x);
};

// ---------------------------------------------------------------------------
// Sampling alignment.

/** Each series as a function: linear between its samples, held flat past
 *  its first and last sample. */
export const linearFn = (rows: Row[], c: string) => {
  const pts = rows.filter((r) => r.c === c).sort((a, b) => a.x - b.x);
  return (x: number) => {
    if (x <= pts[0].x) return pts[0].y;
    if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
    let i = 1;
    while (pts[i].x < x) i++;
    const [a, b] = [pts[i - 1], pts[i]];
    return a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
  };
};

const uniq = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);

/** ggplot2 stat_align style: every series read at the union of all x. */
export const alignUnion = (rows: Row[]): Row[] => {
  const xs = uniq(rows.map((r) => r.x));
  const names = [...new Set(rows.map((r) => r.c))];
  return names.flatMap((c) => {
    const fc = linearFn(rows, c);
    return xs.map((x) => ({ x, y: fc(x), c }));
  });
};

/**
 * Boundary functions: B_k = f_1 + ... + f_k, each read only at the union of
 * the samples of f_1..f_k, so it is exact and lower boundaries have fewer
 * points. Band k is the polygon between B_{k-1} and B_k; the two bands
 * that share a boundary share the very same point array.
 */
export const boundaryBands = (rows: Row[]) => {
  const names = [...new Set(rows.map((r) => r.c))];
  const fns = names.map((c) => linearFn(rows, c));
  const all = uniq(rows.map((r) => r.x));
  const [x0, x1] = [all[0], all[all.length - 1]];
  const boundaries: [number, number][][] = [
    [
      [x0, 0],
      [x1, 0],
    ],
  ];
  names.forEach((_, k) => {
    const xs = uniq([
      x0,
      x1,
      ...rows.filter((r) => names.indexOf(r.c) <= k).map((r) => r.x),
    ]);
    boundaries.push(
      xs.map((x) => [x, fns.slice(0, k + 1).reduce((s, fi) => s + fi(x), 0)])
    );
  });
  return {
    boundaries,
    bands: names.map((c, k) => ({
      c,
      ring: [...boundaries[k + 1], ...[...boundaries[k]].reverse()],
    })),
  };
};

// ---------------------------------------------------------------------------
// Curve order: stack then curve, against curve then sum.

/** The monotone curve GoFish draws (d3's curveMonotoneX), read at `x`. */
export const monotoneAt = (knots: number[], values: number[]) => {
  const sp = channelSpline("monotone", knots, values);
  return (x: number) => {
    let i = 0;
    while (i < knots.length - 2 && knots[i + 1] < x) i++;
    return sp.at(i, (x - knots[i]) / (knots[i + 1] - knots[i]));
  };
};

/** Coarse data for the curve comparison: three series at every 4th x. */
export const coarse: Row[] = topics.filter(
  (r) => r.x % 4 === 0 && ["Maps", "Sports", "Games"].includes(r.c)
);

/** Dense rows from each series' own monotone curve, summed afterwards. */
export const curveThenSum = (rows: Row[], n = 200): Row[] => {
  const names = [...new Set(rows.map((r) => r.c))];
  const xs = uniq(rows.map((r) => r.x));
  const dense = Array.from(
    { length: n },
    (_, i) => xs[0] + ((xs[xs.length - 1] - xs[0]) * i) / (n - 1)
  );
  return names.flatMap((c) => {
    const pts = rows.filter((r) => r.c === c).sort((a, b) => a.x - b.x);
    const fc = monotoneAt(
      pts.map((p) => p.x),
      pts.map((p) => p.y)
    );
    return dense.map((x) => ({ x, y: fc(x), c }));
  });
};

/** The stacked boundaries curved afterwards (what the ribbon draws), minus
 *  the boundaries of curveThenSum, at the same dense x. */
export const curveOrderDifference = (rows: Row[], n = 200) => {
  const stacked = stackRows(rows, {});
  const names = [...new Set(rows.map((r) => r.c))];
  const dense = stackRows(curveThenSum(rows, n), {});
  return names.flatMap((c) => {
    const pts = stacked.filter((r) => r.c === c);
    const top = monotoneAt(
      pts.map((p) => p.x),
      pts.map((p) => p.y1)
    );
    return dense
      .filter((r) => r.c === c)
      .map((r) => ({ x: r.x, y: top(r.x) - r.y1, c }));
  });
};

/** The thickness of the top band two ways: (a) the curved top boundary
 *  minus the curved boundary below it, (b) the band's own curve. */
export const curveOrderThickness = (rows: Row[], n = 400): Row[] => {
  const names = [...new Set(rows.map((r) => r.c))];
  const stacked = stackRows(rows, {});
  const curveOf = (c: string, key: "y0" | "y1" | "y") => {
    const p = (key === "y" ? rows : stacked).filter((r) => r.c === c);
    return monotoneAt(
      p.map((r) => r.x),
      p.map((r) => (r as any)[key])
    );
  };
  const c = names[names.length - 1];
  const [top, bottom, own] = [
    curveOf(c, "y1"),
    curveOf(c, "y0"),
    curveOf(c, "y"),
  ];
  const xs = rows.map((r) => r.x);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  return Array.from(
    { length: n },
    (_, i) => x0 + ((x1 - x0) * i) / (n - 1)
  ).flatMap((x) => [
    { x, y: top(x) - bottom(x), c: "(a) stack, then curve" },
    { x, y: own(x), c: "(b) curve, then stack" },
  ]);
};

// ---------------------------------------------------------------------------
// Densities.

const normal = () => {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};
seed = 42;
export const samples: { g: string; v: number }[] = [
  ...Array.from({ length: 60 }, () => ({ g: "a", v: round(2 + normal()) })),
  ...Array.from({ length: 40 }, () => ({
    g: "b",
    v: round(5 + 1.5 * normal()),
  })),
  ...Array.from({ length: 30 }, () => ({
    g: "c",
    v: round(rand() < 0.5 ? 3.5 + 0.6 * normal() : 8 + 0.8 * normal()),
  })),
];

/**
 * A Gaussian kernel density per group (Silverman's bandwidth), read at `n`
 * points over the range of all values. `weighted`: each group's density is
 * scaled by its share of the rows, so the stack is the mixture density.
 */
export const densityRows = (
  rows: { g: string; v: number }[],
  { n = 120, weighted = true } = {}
): Row[] => {
  const vs = rows.map((r) => r.v);
  const [lo, hi] = [Math.min(...vs) - 2, Math.max(...vs) + 2];
  const groups = [...new Set(rows.map((r) => r.g))];
  return groups.flatMap((g) => {
    const xs = rows.filter((r) => r.g === g).map((r) => r.v);
    const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
    const sd = Math.sqrt(
      xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length
    );
    const bw = 1.06 * sd * xs.length ** -0.2;
    const share = weighted ? xs.length / rows.length : 1;
    return Array.from({ length: n }, (_, i) => {
      const x = lo + ((hi - lo) * i) / (n - 1);
      const d =
        xs.reduce((s, v) => s + Math.exp(-0.5 * ((x - v) / bw) ** 2), 0) /
        (xs.length * bw * Math.sqrt(2 * Math.PI));
      return { x: round(x), y: share * d, c: g };
    });
  });
};
