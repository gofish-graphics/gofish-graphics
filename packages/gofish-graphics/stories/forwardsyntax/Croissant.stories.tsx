import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Bin,
  blank,
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
 * Croissant charts (Fygenson, Bertini and Padilla, EuroVis 2026): a density
 * curve cut at its quantiles into equal-probability slices, each drawn on its
 * own with a small gap, with one dot per slice at the slice's median.
 *
 * Each chart is two layers over one table, the curve's grid rows `{ x, pdf }`.
 * The first draws the curve (`fill: "none"`, so it is not seen). The second
 * turns the grid into quantile rows of the drawn curve (`quantileRows`),
 * partitions them into `Bin.quantiles(10)` cells, and in each cell draws the
 * curve's area intersected with the cell's region, drawn in by 3 pixels, plus
 * a dot at the cell's median. The second layer is a `.relate()` clause of the
 * first, so `density` names the curve drawn beside it.
 */
const meta: Meta = { title: "Forward Syntax/Croissant" };
export default meta;

type Args = { w: number; h: number };

const FILL = "#D1E4F6";
const STROKE = "#467DA8";

const normPdf = (x: number, mu = 0, sd = 1) =>
  Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));

/** `n` evenly spaced grid rows `{ x, pdf }` of `f` over `[lo, hi]`. */
const gridOf = (f: (x: number) => number, lo: number, hi: number, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const x = lo + ((hi - lo) * i) / (n - 1);
    return { x, pdf: f(x) };
  });

/** A Gaussian kernel density estimate of `values`, with Silverman's
 *  rule-of-thumb bandwidth. */
const kde = (values: number[]) => {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
  );
  const bw = 1.06 * sd * n ** -0.2;
  return {
    bw,
    f: (x: number) => values.reduce((s, v) => s + normPdf(x, v, bw), 0) / n,
  };
};

// The standard normal on [-4, 4]: wide enough that the outer quantile rows
// are accurate (on [-3, 3] the missing tails move the outer cells' medians).
const normalGrid = gridOf((x) => normPdf(x), -4, 4, 401);

export const Croissant: StoryObj<Args> = {
  args: { w: 480, h: 200 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Croissant",
      description:
        "A croissant chart of the standard normal distribution: the density curve cut at its deciles into ten slices of equal probability, each with a dot at its median.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    layer([
      chart(normalGrid)
        .flow(scatter({ x: "x" }))
        .mark(ribbon({ h: "pdf", fill: "none" }).name("density")),
    ])
      .relate(({ density }) => [
        chart(normalGrid)
          .flow(
            derive((rows) =>
              quantileRows(rows, { x: "x", density: "pdf", n: 1000 })
            ),
            partition({ by: field("x").bin(Bin.quantiles(10)), dir: "x" })
          )
          .mark(
            layer([
              intersect({ fill: FILL, stroke: STROKE, strokeWidth: 2 }, [
                density,
                region({ inset: 3 }),
              ]),
              circle({ cx: field("x").median(), cy: 6, r: 3, fill: STROKE }),
            ])
          ),
      ])
      .render(container, {
        w: args.w,
        h: args.h,
        axes: { x: true, y: false },
      });
    return container;
  },
};

// Penguin body mass, a skewed sample with two humps (Gentoo penguins are
// heavier), as a kernel density estimate on a grid.
const masses = penguins
  .map((p) => p["Body Mass (g)"])
  .filter((v): v is number => v != null);
const massGrid = gridOf(kde(masses).f, 2200, 6800, 461);

export const PenguinBodyMass: StoryObj<Args> = {
  args: { w: 520, h: 220 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Penguin Body Mass Croissant",
      description:
        "A croissant chart of penguin body mass: ten equal-probability slices of a kernel density estimate, narrow under the lighter species' hump and wide across the heavier Gentoo shoulder.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    layer([
      chart(massGrid)
        .flow(scatter({ x: "x" }))
        .mark(ribbon({ h: "pdf", fill: "none" }).name("density")),
    ])
      .relate(({ density }) => [
        chart(massGrid)
          .flow(
            derive((rows) =>
              quantileRows(rows, { x: "x", density: "pdf", n: 1000 })
            ),
            partition({ by: field("x").bin(Bin.quantiles(10)), dir: "x" })
          )
          .mark(
            layer([
              intersect({ fill: FILL, stroke: STROKE, strokeWidth: 2 }, [
                density,
                region({ inset: 3 }),
              ]),
              circle({ cx: field("x").median(), cy: 6, r: 3, fill: STROKE }),
            ])
          ),
      ])
      .render(container, {
        w: args.w,
        h: args.h,
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

// One density per month of Seattle's daily highs, each on its own grid from
// three bandwidths below the month's lowest high to three above its highest.
const monthlyDensity = months.flatMap((month, m) => {
  const highs = seattleWeather
    .filter((d) => new Date(d.date).getUTCMonth() === m)
    .map((d) => d.temp_max);
  const { f, bw } = kde(highs);
  const lo = Math.min(...highs) - 3 * bw;
  const hi = Math.max(...highs) + 3 * bw;
  return gridOf(f, lo, hi, 161).map(({ x, pdf }) => ({
    month,
    temp_max: x,
    pdf,
  }));
});

export const Ridgeline: StoryObj<Args> = {
  args: { w: 520, h: 0 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Croissant Ridgeline of Seattle Highs by Month",
      description:
        "A ridgeline of croissant charts, one per month of Seattle's daily high temperatures, each month's density cut at its own deciles into ten equal-probability slices.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(monthlyDensity, {
      w: args.w,
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
        layer([
          // An empty-scope chart() reads the month's rows and draws no
          // anchors of its own, so the ribbon connects explicit blanks.
          chart()
            .flow(scatter({ x: "temp_max", h: 34 }))
            .mark(blank({ h: "pdf" }))
            .layer(ribbon({ fill: "none" }).name("density")),
        ]).relate(({ density }) => [
          chart()
            .flow(
              derive((rows) =>
                quantileRows(rows, { x: "temp_max", density: "pdf", n: 1000 })
              ),
              partition({
                by: field("temp_max").bin(Bin.quantiles(10)),
                dir: "x",
              })
            )
            .mark(
              layer([
                intersect({ fill: FILL, stroke: STROKE, strokeWidth: 1.5 }, [
                  density,
                  region({ inset: 1.5 }),
                ]),
                circle({
                  cx: field("temp_max").median(),
                  cy: 4,
                  r: 1.75,
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
