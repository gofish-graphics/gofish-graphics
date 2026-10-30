/**
 * Definitions of the signal marks `slab`, `interval` and `dots` (#980), as the
 * library would write them, elaborated only into marks and operators that are
 * exported today.
 *
 * `Dist` does not exist yet, so this file carries a minimal stand-in for it
 * (section 1) and for the proposed `dist` channel kind (section 2). The marks
 * are sections 3 to 5.
 *
 * In the library each mark would be
 *
 *   export const slab = createMark(slabBody, { x: "dist", y: "dist" }, "slab");
 *
 * with `CHANNEL_INFER.dist = foldDist` (withGoFish.ts, channels.ts). Today
 * `createMark` hands its body the inferred channels and not the group's rows,
 * and the channel kinds are fixed (`size | pos | color | raw | dims`), so a
 * story cannot add `dist`. Each mark here is therefore a plain `Mark<T[]>`
 * (the function a `createMark` mark is under the hood): it takes the group's
 * rows and calls `foldDist` itself, which is exactly what the `dist` channel
 * would do before the body runs.
 */

import {
  chart,
  circle,
  derive,
  group,
  layer,
  line,
  rect,
  ribbon,
  scatter,
  stack,
  v,
  type Mark,
  type MarkChild,
} from "../../../src/lib";

/** A signal mark's body: the group's rows to anything a mark may return.
 *  `Mark<T>`'s declared return type omits two things `resolveMarkResult`
 *  accepts (a `LayerBuilder`, and a combinator mark such as `layer([...])`),
 *  so this cast only widens the declared type to what the runtime takes. */
const signalMark = <T,>(body: (rows: T[]) => MarkChild): Mark<T[]> =>
  body as unknown as Mark<T[]>;

// ===========================================================================
// 1. The Dist stand-in
// ===========================================================================

/**
 * A distribution over numbers. `cdf` is one more method than the brief's
 * minimal interface: the quantile of a mixture (the one-fold rule) has no
 * closed form, and is found by inverting the mixture's CDF.
 */
export interface Dist {
  quantile(p: number): number;
  pdf(x: number): number;
  cdf(x: number): number;
  /** The range a mark draws over. A normal's true support is the whole line,
   *  so this is a display range, not the support (types.md decision 8). */
  support(): [number, number];
}

const SQRT2PI = Math.sqrt(2 * Math.PI);

/** erf, Abramowitz and Stegun 7.1.26 (error below 1.5e-7). */
const erf = (x: number) => {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-a * a);
  return s * y;
};

/** The p-quantile of a continuous `cdf` over [lo, hi], by bisection. */
const invert = (
  cdf: (x: number) => number,
  [lo, hi]: [number, number],
  p: number
) => {
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

/** All mass at `x`: what a plain value is, as a Dist. */
export const pure = (x: number): Dist => ({
  quantile: () => x,
  pdf: () => 0,
  cdf: (t) => (t < x ? 0 : 1),
  support: () => [x, x],
});

const z = (p: number) =>
  invert((t) => 0.5 * (1 + erf(t / Math.SQRT2)), [-12, 12], p);

/** Normal(mean, sd). sd = 0 is the point mass at the mean. */
export const normal = (mean: number, sd: number): Dist =>
  sd === 0
    ? pure(mean)
    : {
        quantile: (p) => mean + sd * z(p),
        pdf: (x) => Math.exp(-0.5 * ((x - mean) / sd) ** 2) / (sd * SQRT2PI),
        cdf: (x) => 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2))),
        support: () => [mean - 4 * sd, mean + 4 * sd],
      };

/** LogNormal(meanlog, sdlog): exp of Normal(meanlog, sdlog). */
export const lognormal = (meanlog: number, sdlog: number): Dist => {
  const n = normal(meanlog, sdlog);
  return {
    quantile: (p) => Math.exp(n.quantile(p)),
    pdf: (x) => (x <= 0 ? 0 : n.pdf(Math.log(x)) / x),
    cdf: (x) => (x <= 0 ? 0 : n.cdf(Math.log(x))),
    support: () => [
      Math.exp(meanlog - 4 * sdlog),
      Math.exp(meanlog + 4 * sdlog),
    ],
  };
};

/** A KDE bandwidth: a number in the value's unit, or Silverman's rule. */
export type Smoothing = number | "silverman";

/**
 * The empirical distribution of `values` (with optional `weights`). Its
 * quantile and CDF are the sample's own: type-7 quantiles, the step ECDF.
 * Its density is a Gaussian KDE, because a sample has none of its own; the
 * bandwidth is `smoothing`, by default Silverman's rule of thumb
 * 1.06 · sd · n^(−1/5), the same as `kde` in Croissant.stories.tsx.
 */
export const empirical = (
  values: number[],
  weights?: number[],
  smoothing: Smoothing = "silverman"
): Dist => {
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const xs = order.map((i) => values[i]);
  const ws = order.map((i) => weights?.[i] ?? 1);
  const W = ws.reduce((s, w) => s + w, 0);
  const n = xs.length;
  const mean = xs.reduce((s, x, i) => s + ws[i] * x, 0) / W;
  const sd = Math.sqrt(
    (xs.reduce((s, x, i) => s + ws[i] * (x - mean) ** 2, 0) / W) *
      (n / Math.max(n - 1, 1))
  );
  const bw = smoothing === "silverman" ? 1.06 * sd * n ** -0.2 : smoothing;
  // Type 7 on the unweighted sample; with weights, linear interpolation of
  // the weighted ECDF between the cumulative midpoints of the rows.
  const at = weights
    ? (() => {
        let c = 0;
        return ws.map((w) => (c += w) - w / 2).map((c) => c / W);
      })()
    : xs.map((_, i) => (n === 1 ? 0.5 : i / (n - 1)));
  return {
    quantile: (p) => {
      if (p <= at[0]) return xs[0];
      if (p >= at[n - 1]) return xs[n - 1];
      let i = 0;
      while (at[i + 1] < p) i++;
      const f = (p - at[i]) / (at[i + 1] - at[i]);
      return xs[i] + f * (xs[i + 1] - xs[i]);
    },
    pdf: (x) =>
      bw === 0
        ? 0
        : xs.reduce(
            (s, xi, i) => s + ws[i] * Math.exp(-0.5 * ((x - xi) / bw) ** 2),
            0
          ) /
          (W * bw * SQRT2PI),
    cdf: (x) => xs.reduce((s, xi, i) => s + (xi <= x ? ws[i] : 0), 0) / W,
    support: () => [xs[0] - 3 * bw, xs[n - 1] + 3 * bw],
  };
};

/** The mixture Σ wᵢ Dᵢ / Σ wᵢ. Its quantile inverts the mixed CDF. */
export const mixture = (ds: Dist[], weights?: number[]): Dist => {
  if (ds.length === 1) return ds[0];
  const ws = ds.map((_, i) => weights?.[i] ?? 1);
  const W = ws.reduce((s, w) => s + w, 0);
  const sum = (f: (d: Dist) => number) =>
    ds.reduce((s, d, i) => s + ws[i] * f(d), 0) / W;
  const range: [number, number] = [
    Math.min(...ds.map((d) => d.support()[0])),
    Math.max(...ds.map((d) => d.support()[1])),
  ];
  const cdf = (x: number) => sum((d) => d.cdf(x));
  return {
    quantile: (p) => invert(cdf, range, p),
    pdf: (x) => sum((d) => d.pdf(x)),
    cdf,
    support: () => range,
  };
};

// ===========================================================================
// 2. The dist channel: per-row expressions and the one fold
// ===========================================================================

/** What a `dist` channel holds: a column (of numbers or of Dists), a per-row
 *  expression such as `dist.normal({ mean: "m", sd: "s" })`, or one Dist. */
export type DistChannel<T> = string | ((row: T) => Dist | number) | Dist;

const isDist = (x: unknown): x is Dist =>
  typeof x === "object" && x !== null && "quantile" in x && "pdf" in x;

/** A parameter of a `dist.*` constructor: a number, or a column name. */
type Param = number | string;
const read = (row: any, p: Param): number =>
  typeof p === "number" ? p : (row[p] as number);

/** The stand-in for the proposed `dist` namespace: each call is a per-row
 *  expression that builds one Dist per row from parameter columns. */
export const dist = {
  normal:
    (o: { mean: Param; sd: Param }) =>
    (row: any): Dist =>
      normal(read(row, o.mean), read(row, o.sd)),
  lognormal:
    (o: { meanlog: Param; sdlog: Param }) =>
    (row: any): Dist =>
      lognormal(read(row, o.meanlog), read(row, o.sdlog)),
};

/**
 * The one-fold rule (types.md): a group's rows fold to one Dist.
 *
 * - Every cell a Dist: their mixture, with equal weights. One row gives its
 *   own Dist.
 * - Every cell a plain value: the empirical Dist of the values, smoothed by
 *   `smoothing` for its density.
 * - Both: the mixture, a plain value being `pure` of itself. (A pure value
 *   has no density, so a slab of such a mix draws only the Dist cells.)
 *
 * This is what the proposed `dist` channel kind runs, as `size` sums and
 * `pos` averages, before the mark body sees the value.
 */
export function foldDist<T>(
  channel: DistChannel<T>,
  rows: T[],
  smoothing: Smoothing = "silverman"
): Dist {
  if (isDist(channel)) return channel;
  const cells = rows.map((r) =>
    typeof channel === "string" ? (r as any)[channel] : channel(r)
  ) as (Dist | number)[];
  if (cells.every((c) => typeof c === "number"))
    return empirical(cells as number[], undefined, smoothing);
  return mixture(cells.map((c) => (isDist(c) ? c : pure(c))));
}

/** The two channels every signal mark takes: exactly one of them, and its
 *  name is the axis the distribution lies along. `cross` is the other axis,
 *  the one the mark's thickness or height grows along. */
type DistAxisOptions<T> =
  | { x: DistChannel<T>; y?: undefined }
  | { y: DistChannel<T>; x?: undefined };

const distAxis = <T,>(o: DistAxisOptions<T>, mark: string) => {
  if ((o.x === undefined) === (o.y === undefined))
    throw new Error(`${mark}: give x or y, not both.`);
  return o.x !== undefined
    ? { axis: "x" as const, cross: "y" as const, channel: o.x }
    : { axis: "y" as const, cross: "x" as const, channel: o.y! };
};

type Paint = { fill?: string; stroke?: string; opacity?: number };

// ===========================================================================
// 3. slab
// ===========================================================================

export type SlabOptions<T> = DistAxisOptions<T> &
  Paint & {
    /** Which side of the line the shape grows to. both is a violin. */
    side?: "end" | "start" | "both";
    /** all: one density scale for every slab. group: each fills its height. */
    normalize?: "all" | "group";
    /** The KDE bandwidth, for a group of plain values. */
    smoothing?: Smoothing;
    /** Grid size. A default of the drawing, not a semantic. */
    k?: number;
  };

/**
 * slab: the density of D as a filled shape along its axis.
 *
 * Definition. Let D be the group's folded Dist, f its density, v the value
 * axis and s the cross axis. The slab is the region
 *
 *   side end:   { (v, s) : 0 ≤ s ≤ f(v) / Z }
 *   side start: { (v, s) : −f(v) / Z ≤ s ≤ 0 }
 *   side both:  { (v, s) : |s| ≤ f(v) / Z }
 *
 * for v in D's display range. Z is 1 for `normalize: "all"`, so every slab is
 * in density units on one shared size scale, and it is max_v f(v) for
 * `normalize: "group"`, so each slab's peak is 1. The size scale then maps
 * the largest s in the chart to the space the slab is given (h).
 *
 * Decided: the region, the side rule, what each normalize divides by.
 * Defaults: the grid (k = 121 evenly spaced points over `support()`), the
 * display range of an unbounded Dist, the KDE bandwidth (Silverman), and the
 * curve through the grid (ribbon's auto monotone curve).
 *
 * Elaborates into: `derive` of the k grid rows { v, s } of one group, a
 * `scatter` along v, and a `ribbon` through anchors of size s (side end).
 * side start is the same ribbon with size −s, a signed extent, so it hangs
 * from the line. side both is the `layer` of the two halves.
 *
 * Not fully expressed: the line s = 0 is the slab's own origin. Two slabs in
 * one `layer` share it (a violin and a start half line up). An `interval`
 * beside a start or both slab does not: the layer places the interval's box
 * at the layer's bottom, not at the slab's origin, and a literal `cy: 0` on
 * the interval does not pin it to that origin either. Only side end, whose
 * origin is its bottom, lines up with the interval. The fix is an origin the
 * layer aligns its children by, which is a layout question, not a slab one.
 *
 * Outside the group: `normalize: "all"` needs Z shared by every slab. This
 * elaboration gets it from the chart's shared size scale (the slab heights
 * are raw densities, and one scale maps them all), so it needs no extra
 * pass. The catch is that the scale is shared with any other size channel on
 * that axis in the same chart, so "all" means "all marks on this scale", not
 * "all slabs".
 */
export const slab = <T,>(o: SlabOptions<T>): Mark<T[]> =>
  signalMark((rows: T[]) => {
    const { axis, cross, channel } = distAxis(o, "slab");
    const side = o.side ?? "end";
    const k = o.k ?? 121;
    const grid = (rows: T[]) => {
      const d = foldDist(channel, rows, o.smoothing);
      const [lo, hi] = d.support();
      const pts = Array.from(
        { length: k },
        (_, i) => lo + ((hi - lo) * i) / (k - 1)
      );
      const Z =
        (o.normalize ?? "all") === "group"
          ? Math.max(...pts.map((p) => d.pdf(p)))
          : 1;
      return pts.map((p) => ({ v: p, s: d.pdf(p) / Z, neg: -d.pdf(p) / Z }));
    };
    const size = cross === "y" ? "h" : "w";
    const paint = { fill: o.fill, stroke: o.stroke, opacity: o.opacity };
    // A half is a ribbon through anchors of signed size: s grows from the
    // line (end), −s hangs from it (start). Signed extents keep the line at
    // the half's origin (#773), so both is the layer of the two halves.
    const half = (sign: 1 | -1) =>
      chart(rows)
        .flow(derive(grid), scatter({ [axis]: "v" }))
        .mark(ribbon({ ...paint, dir: axis, [size]: sign > 0 ? "s" : "neg" }));
    if (side === "end") return half(1);
    if (side === "start") return half(-1);
    return layer([half(1), half(-1)]);
  });

// ===========================================================================
// 4. interval
// ===========================================================================

/** The thickness ladder: the widest level is thinnest. ggdist's default is
 *  interval_size_range = c(0.6, 1.4) × the line width; this is that ramp in
 *  pixels, from `thin` (widest level) to `thick` (narrowest). */
const ladder = (n: number, i: number, thin = 1.5, thick = 4) =>
  n === 1 ? thick : thin + ((thick - thin) * i) / (n - 1);

export type IntervalOptions<T> = DistAxisOptions<T> &
  Paint & {
    /** Probabilities of the nested central intervals. */
    levels?: number[];
    /** A column of the rows: the intervals join into bands along it. */
    along?: string;
    /** How a band is formed along `along`. Only pointwise is implemented. */
    band?: { kind: "pointwise" };
    /** The point's radius, in pixels. A default of the drawing. */
    r?: number;
    smoothing?: Smoothing;
  };

/** The central interval of level p: [Q((1 − p) / 2), Q((1 + p) / 2)]. */
const central = (d: Dist, p: number) => ({
  lo: d.quantile((1 - p) / 2),
  hi: d.quantile((1 + p) / 2),
});

/**
 * interval: nested central intervals and a point at the median.
 *
 * Definition (point form). Let D be the group's folded Dist, Q its quantile
 * function and p₁ > p₂ > … > pₙ the levels sorted widest first. The mark is
 *
 *   for each level pᵢ: the segment [Q((1 − pᵢ)/2), Q((1 + pᵢ)/2)] on the
 *     value axis, of cross-axis thickness tᵢ, with t₁ < t₂ < … < tₙ;
 *   the point Q(0.5).
 *
 * Definition (`along: a`, `band: Band.pointwise()`). Let D_a be the Dist of
 * the rows at each step a of the tier. For each level p, the band is the
 * region between the curves a ↦ Q_a((1 − p)/2) and a ↦ Q_a((1 + p)/2); the
 * median is the curve a ↦ Q_a(0.5).
 *
 * `Band.depth({ outliers })` (not implemented): needs joint draws c₁ … c_m,
 * each a whole curve over the tier. The modified band depth of a curve c is
 * MBD(c) = mean over pairs j < k of the share of steps a where
 * min(c_j(a), c_k(a)) ≤ c(a) ≤ max(c_j(a), c_k(a)). The band of level p is
 * the pointwise envelope of the ⌈p · m⌉ deepest curves, the median is the
 * deepest curve, and a curve is an outlier when it leaves the 0.5 envelope
 * inflated by `outliers` times its width at some step. It elaborates into
 * the same ribbons, plus a `line` per outlier curve; only the derive changes.
 *
 * Decided: the central intervals (equal tails), the median as the point,
 * thickness decreasing in p, pointwise bands as the default.
 * Defaults: levels [0.66, 0.95], the thickness ladder 1.5 to 4 px, the point
 * radius 4 px, and in the band form an opacity per band of 1 − 0.3^(1/n),
 * so the innermost of n nested bands reaches 0.7 where they overlap.
 *
 * Elaborates into: point form, a `layer` of one `rect` per level, from
 * v(lo) to v(hi) with a fixed thickness, and a `circle` at v(median). Band
 * form, a `layer` of two charts over a `derive` per step: one `rect` of
 * width 0 per (step, level) joined by a `ribbon` per level (`group` by
 * level), and a `line` through the medians.
 *
 * Outside the group: the band form reads every step of the tier, so it
 * cannot be a per-group mark. In the proposal it sits after the user's
 * `scatter({ by: "t" })`, as `line` and `ribbon` do; those are relational
 * marks that the chart builder fuses (`.mark(R)` becomes
 * `.mark(blank).layer(R)`, `tagRelationalFusable`, internal). That fusion
 * makes one blank per group, but a band needs one per (step, level), so
 * `createRelationalMark` cannot express it either. Here the band form is a
 * mark placed at the root, over all rows, that does the split by `along`
 * itself. Band.depth also needs the joint draw key, which is outside every
 * step.
 */
export const interval = <T,>(o: IntervalOptions<T>): Mark<T[]> =>
  signalMark((rows: T[]) => {
    const { axis, cross, channel } = distAxis(o, "interval");
    const levels = [...(o.levels ?? [0.66, 0.95])].sort((a, b) => b - a);
    const fill = o.fill ?? "#1f3b5c";
    if (o.along !== undefined) return intervalAlong(o, rows, levels, fill);
    const d = foldDist(channel, rows, o.smoothing);
    const thick = cross === "y" ? "h" : "w";
    return layer([
      ...levels.map((p, i) => {
        const { lo, hi } = central(d, p);
        return rect({
          [axis]: v(lo),
          [`${axis}2`]: v(hi),
          [thick]: ladder(levels.length, i),
          fill,
        });
      }),
      circle({ [`c${axis}`]: v(d.quantile(0.5)), r: o.r ?? 4, fill }),
    ]);
  });

const intervalAlong = <T,>(
  o: IntervalOptions<T>,
  rows: T[],
  levels: number[],
  fill: string
) => {
  const { axis, cross, channel } = distAxis(o, "interval");
  const along = o.along!;
  const steps = (rows: T[]) => {
    const keys = [...new Set(rows.map((r) => (r as any)[along]))];
    return keys.map((key) => ({
      key,
      d: foldDist(
        channel,
        rows.filter((r) => (r as any)[along] === key),
        o.smoothing
      ),
    }));
  };
  const bands = (rows: T[]) =>
    levels.flatMap((p) =>
      steps(rows).map(({ key, d }) => ({
        [along]: key,
        level: p,
        ...central(d, p),
      }))
    );
  const medians = (rows: T[]) =>
    steps(rows).map(({ key, d }) => ({
      [along]: key,
      median: d.quantile(0.5),
    }));
  const opacity = o.opacity ?? 1 - 0.3 ** (1 / levels.length);
  const thin = cross === "x" ? "w" : "h";
  return layer([
    chart(rows)
      .flow(
        derive(bands),
        group({ by: "level" }),
        scatter({
          by: along,
          [cross]: along,
          [`${axis}Min`]: "lo",
          [`${axis}Max`]: "hi",
        })
      )
      .mark(rect({ [thin]: 0 }))
      .layer(ribbon({ fill, opacity, dir: cross })),
    chart(rows)
      .flow(
        derive(medians),
        scatter({ by: along, [cross]: along, [axis]: "median" })
      )
      .mark(
        line({ stroke: o.stroke ?? "#1f3b5c", strokeWidth: 2, dir: cross })
      ),
  ]);
};

// ===========================================================================
// 5. dots
// ===========================================================================

export type DotsOptions<T> = DistAxisOptions<T> &
  Paint & {
    /** How many dots. */
    n?: number;
    /** How the quantiles are binned, and the bin width in the value's unit. */
    binning?: { kind: "wilkinson" | "fixed"; width?: number };
    /** The dot radius, in pixels. */
    r?: number;
    strokeWidth?: number;
    smoothing?: Smoothing;
  };

/**
 * Bin sorted values. fixed: bins [kw, (k + 1)w), each stack at the bin's
 * center. wilkinson (Wilkinson 1999, dot-density): a bin starts at the
 * smallest value not yet binned and takes every value below start + w; its
 * stack is at the midpoint of its first and last value.
 */
const binQuantiles = (qs: number[], kind: "wilkinson" | "fixed", w: number) => {
  if (kind === "fixed")
    return qs.map((q) => {
      const b = Math.floor(q / w);
      return { bin: b, center: (b + 0.5) * w };
    });
  const out: { bin: number; center: number }[] = [];
  let b = 0;
  for (let i = 0; i < qs.length; b++) {
    let j = i;
    while (j + 1 < qs.length && qs[j + 1] < qs[i] + w) j++;
    for (let m = i; m <= j; m++)
      out.push({ bin: b, center: (qs[i] + qs[j]) / 2 });
    i = j + 1;
  }
  return out;
};

/**
 * dots: a quantile dotplot.
 *
 * Definition. Let D be the group's folded Dist and Q its quantile function.
 * The dots are the n quantiles qᵢ = Q((i − 0.5)/n), i = 1 … n, each one
 * dot of probability 1/n. The dots are binned on the value axis with width w
 * and stacked on the cross axis, from 0, one dot per quantile.
 *
 * Decided: the n quantiles at (i − 0.5)/n (equal probability per dot), and
 * a stack that counts quantiles. Defaults: n = 20, Wilkinson's dot-density
 * binning, the bin width w, and the radius 9 px. (A stack has no gap
 * option: `stack` drops `spacing`, so the prototype's `spacing: 1` was a
 * no-op.)
 *
 * Elaborates into: `derive` of n rows { bin, center }, a `scatter` by bin at
 * its center (aligned at the end of the cross axis, so stacks rise from the
 * baseline), and a `stack` along the cross axis of `circle`s.
 *
 * Outside the group: a dotplot is only right when a dot's diameter equals
 * the bin width on screen, w × (pixels per unit) = 2r. The pixels per unit
 * come from the value axis's scale, which is the whole chart's. This
 * elaboration takes w (data) and r (pixels) as two options and leaves the
 * match to the author. The right default picks w from the scale, as ggdist's
 * auto bin width does, and that is layout information no mark body gets.
 * The placeholder default here is w = (q_n − q_1) / ⌈n / 2⌉.
 */
export const dots = <T,>(o: DotsOptions<T>): Mark<T[]> =>
  signalMark((rows: T[]) => {
    const { axis, cross, channel } = distAxis(o, "dots");
    const n = o.n ?? 20;
    const kind = o.binning?.kind ?? "wilkinson";
    const quantileRows = (rows: T[]) => {
      const d = foldDist(channel, rows, o.smoothing);
      const qs = Array.from({ length: n }, (_, i) => d.quantile((i + 0.5) / n));
      const w = o.binning?.width ?? (qs[n - 1] - qs[0]) / Math.ceil(n / 2);
      return binQuantiles(qs, kind, w).map((b, i) => ({ ...b, q: qs[i] }));
    };
    return chart(rows)
      .flow(
        derive(quantileRows),
        scatter({ by: "bin", [axis]: "center", alignment: "end" }),
        stack({ dir: cross })
      )
      .mark(
        circle({
          r: o.r ?? 9,
          fill: o.fill,
          stroke: o.stroke,
          strokeWidth: o.strokeWidth ?? 1,
          opacity: o.opacity,
        })
      );
  });
