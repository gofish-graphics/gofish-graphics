import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Bin,
  chart,
  circle,
  derive,
  field,
  intersect,
  layer,
  partition,
  quantileRows,
  region,
  ribbon,
  scatter,
  spread,
} from "../../src/lib";
import { penguins } from "../../src/data/penguins";
import { seattleWeather } from "../../src/data/seatle-weather";

/**
 * THROWAWAY prototype stories for the croissant-sampling proposal (#1332).
 * Not library code. The helpers below stand in for what the proposal would
 * add: a Dist value (here a plain object with pdf, cdf, quantile and a
 * default range) and the #980 helper `densityCurve`. Exact cuts of a Dist
 * (`x.bin(Bin.quantiles(n))` on a Dist) are emulated by binning 2000 exact
 * quantiles of the Dist, which matches the quantile function to within
 * 1/2000 in probability.
 */
const meta: Meta = { title: "Proposals/Croissant Sampling" };
export default meta;

const FILL = "#D1E4F6";
const STROKE = "#467DA8";
const PAPER_FILL = "#CBA45F";
const PAPER_STROKE = "#745931";

// --- prototype Dist ---------------------------------------------------------

type Dist = {
  pdf: (x: number) => number;
  cdf: (x: number) => number;
  quantile: (p: number) => number;
  /** The default range a density curve covers. */
  range: [number, number];
};

const SQRT2PI = Math.sqrt(2 * Math.PI);
const erf = (x: number) => {
  // Abramowitz and Stegun 7.1.26
  const s = Math.sign(x);
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return s * y;
};
const phi = (z: number) => Math.exp(-0.5 * z * z) / SQRT2PI;
const Phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

const invert = (cdf: (x: number) => number, lo: number, hi: number) => (
  p: number
) => {
  let a = lo;
  let b = hi;
  for (let i = 0; i < 80; i++) {
    const m = (a + b) / 2;
    if (cdf(m) < p) a = m;
    else b = m;
  }
  return (a + b) / 2;
};

/** dist.normal: range = the 0.001 and 0.999 quantiles, as ggdist does. */
const normal = (mean = 0, sd = 1): Dist => {
  const cdf = (x: number) => Phi((x - mean) / sd);
  const quantile = invert(cdf, mean - 12 * sd, mean + 12 * sd);
  return {
    pdf: (x) => phi((x - mean) / sd) / sd,
    cdf,
    quantile,
    range: [quantile(0.001), quantile(0.999)],
  };
};

/** field(x).kde({ smoothing }): Gaussian kernels, Silverman's bandwidth by
 *  default; range = the data's extent plus 3 bandwidths each side (seaborn's
 *  `cut = 3`). The cdf is exact (a sum of normal cdfs). */
const kde = (values: number[], smoothing?: number): Dist => {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
  );
  const bw = smoothing ?? 1.06 * sd * n ** -0.2;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const cdf = (x: number) =>
    values.reduce((s, v) => s + Phi((x - v) / bw), 0) / n;
  return {
    pdf: (x) => values.reduce((s, v) => s + phi((x - v) / bw), 0) / (n * bw),
    cdf,
    quantile: invert(cdf, lo - 10 * bw, hi + 10 * bw),
    range: [lo - 3 * bw, hi + 3 * bw],
  };
};

/** #980's densityCurve: n evenly spaced rows { v, density, cdf } over the
 *  Dist's range. n defaults to 512. */
const densityCurve = (
  d: Dist,
  { n = 512, range = d.range }: { n?: number; range?: [number, number] } = {}
) =>
  Array.from({ length: n }, (_, i) => {
    const v = range[0] + ((range[1] - range[0]) * i) / (n - 1);
    return { v, density: d.pdf(v), cdf: d.cdf(v) };
  });

/** Emulates binning a Dist: 2000 rows at its exact quantiles. */
const exactQuantiles = (d: Dist, n = 2000) =>
  Array.from({ length: n }, (_, i) => ({ v: d.quantile((i + 0.5) / n) }));

// --- the croissant, proposed spelling (emulated) ----------------------------

const croissant = (
  d: Dist,
  { n = 10, fill = FILL, stroke = STROKE, curve = {} as { n?: number } } = {}
) =>
  layer([
    chart(densityCurve(d, curve))
      .flow(scatter({ x: "v" }))
      .mark(ribbon({ h: "density" }).name("density").hidden()),
  ]).relate(({ density }) => [
    chart(exactQuantiles(d))
      .flow(partition({ by: field("v").bin(Bin.quantiles(n)), dir: "x" }))
      .mark(
        layer([
          intersect({ fill, stroke, strokeWidth: 2 }, [
            density,
            region({ inset: 3 }),
          ]),
          circle({ cx: field("v").median(), cy: 6, r: 3, fill: stroke }),
        ])
      ),
  ]);

export const Normal: StoryObj = {
  render: () => {
    const container = initializeContainer();
    croissant(normal(0, 1), {
      n: 5,
      fill: PAPER_FILL,
      stroke: PAPER_STROKE,
    }).render(container, {
      w: 480,
      h: 200,
      axes: { x: { title: "x" }, y: false },
    });
    return container;
  },
};

const masses = penguins
  .map((p) => p["Body Mass (g)"])
  .filter((v): v is number => v != null);

export const PenguinBodyMass: StoryObj = {
  render: () => {
    const container = initializeContainer();
    croissant(kde(masses)).render(container, {
      w: 520,
      h: 220,
      axes: { x: { title: "Body mass (g)" }, y: false },
    });
    return container;
  },
};

const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const weather = seattleWeather.map((d) => ({
  month: months[new Date(d.date).getUTCMonth()],
  temp_max: d.temp_max,
}));
const monthDist = (rows: { temp_max: number }[]) =>
  kde(rows.map((r) => r.temp_max));

export const Ridgeline: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(weather, {
      w: 520,
      axes: { x: { title: "Daily high (°C)" }, y: false },
    })
      .flow(
        spread({
          by: field("month").sort(months),
          dir: "y",
          anchor: "baseline",
          spacing: 36,
        })
      )
      .mark(
        layer({ h: 34 }, [
          chart()
            .flow(
              derive((rows: any[]) => densityCurve(monthDist(rows))),
              scatter({ x: "v" })
            )
            .mark(ribbon({ h: "density" }).name("density").hidden()),
        ]).relate(({ density }) => [
          chart()
            .flow(
              derive((rows: any[]) => exactQuantiles(monthDist(rows))),
              partition({ by: field("v").bin(Bin.quantiles(5)), dir: "x" })
            )
            .mark(
              layer([
                intersect({ fill: FILL, stroke: STROKE, strokeWidth: 1.5 }, [
                  density,
                  region({ inset: 2 }),
                ]),
                circle({
                  cx: field("v").median(),
                  cy: 5,
                  r: 2.25,
                  fill: STROKE,
                }),
              ])
            ),
        ])
      )
      .render(container);
    return container;
  },
};

// --- why: today's spelling with a [-3, 3] grid ------------------------------

const gridOf = (f: (x: number) => number, lo: number, hi: number, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const x = lo + ((hi - lo) * i) / (n - 1);
    return { x, pdf: f(x) };
  });

/** Today's croissant over a grid, with a second row of dots (red) at the
 *  exact medians, so the drift shows. */
export const TodayNarrowGrid: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const d = normal(0, 1);
    const grid = gridOf(d.pdf, -2.2, 2.2, 45);
    const exact = Array.from({ length: 5 }, (_, i) => ({
      m: d.quantile((i + 0.5) / 5),
    }));
    layer([
      chart(grid)
        .flow(scatter({ x: "x" }))
        .mark(ribbon({ h: "pdf" }).name("density").hidden()),
    ])
      .relate(({ density }) => [
        chart(grid)
          .flow(
            derive((rows) =>
              quantileRows(rows, { x: "x", density: "pdf", n: 1000 })
            ),
            partition({ by: field("x").bin(Bin.quantiles(5)), dir: "x" })
          )
          .mark(
            layer([
              intersect({ fill: PAPER_FILL, stroke: PAPER_STROKE, strokeWidth: 2 }, [
                density,
                region({ inset: 3 }),
              ]),
              circle({
                cx: field("x").median(),
                cy: 6,
                r: 3,
                fill: PAPER_STROKE,
              }),
            ])
          ),
        chart(exact)
          .flow(scatter({ x: "m" }))
          .mark(circle({ cy: -6, r: 3, fill: "#C0392B" })),
      ])
      .render(container, {
        w: 480,
        h: 200,
        axes: { x: { title: "x" }, y: false },
      });
    return container;
  },
};

// --- screen-aware sampling: a narrow bandwidth -------------------------------

const W = 520;
const H = 60;

/** Adaptive sampling on the screen: split an interval until the curve's
 *  midpoint is within `tol` pixels of the chord (the rule of d3-geo's
 *  resample and of src/adaptive-resampling.ts). Pixel scales come from the
 *  chart's w and h here; at layout they would be the axis's σ. */
const adaptive = (
  d: Dist,
  { tol = 0.5, start = 16, maxDepth = 10 } = {}
) => {
  const [lo, hi] = d.range;
  let peak = 0;
  for (let i = 0; i <= 400; i++) peak = Math.max(peak, d.pdf(lo + ((hi - lo) * i) / 400));
  const sx = W / (hi - lo);
  const sy = H / peak;
  const out: { v: number; density: number }[] = [];
  const rec = (a: number, fa: number, b: number, fb: number, depth: number) => {
    const m = (a + b) / 2;
    const fm = d.pdf(m);
    const dev = Math.abs(fm - (fa + fb) / 2) * sy;
    if (depth < maxDepth && (dev > tol || (b - a) * sx > 40)) {
      rec(a, fa, m, fm, depth + 1);
      rec(m, fm, b, fb, depth + 1);
    } else out.push({ v: b, density: fb });
  };
  out.push({ v: lo, density: d.pdf(lo) });
  for (let i = 0; i < start; i++) {
    const a = lo + ((hi - lo) * i) / start;
    const b = lo + ((hi - lo) * (i + 1)) / start;
    rec(a, d.pdf(a), b, d.pdf(b), 0);
  }
  return out;
};

const narrow = kde(masses, 25);
const sampled = [
  ...densityCurve(narrow, { n: 101 }).map((r) => ({ ...r, how: "a" })),
  ...densityCurve(narrow, { n: 512 }).map((r) => ({ ...r, how: "b" })),
  ...adaptive(narrow).map((r) => ({ ...r, how: "c" })),
];

export const NarrowBandwidth: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(sampled, { w: W, axes: { x: { title: "Body mass (g)" }, y: false } })
      .flow(spread({ by: "how", dir: "y", anchor: "baseline", spacing: 90 }))
      .mark(
        layer({ h: H }, [
          chart()
            .flow(scatter({ x: "v" }))
            .mark(ribbon({ h: "density", fill: FILL, stroke: STROKE, strokeWidth: 1 })),
        ])
      )
      .render(container);
    return container;
  },
};
