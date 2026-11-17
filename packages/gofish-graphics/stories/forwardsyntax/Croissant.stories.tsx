import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Bin,
  Calendar,
  chart,
  circle,
  derive,
  Dist,
  field,
  intersect,
  layer,
  partition,
  quantileRows,
  region,
  ribbon,
  scatter,
  spread,
  text,
  Unit,
} from "../../src/lib";
import { penguins } from "../../src/data/penguins";
import { seattleWeather } from "../../src/data/seatle-weather";

/**
 * Croissant charts (Fygenson, Bertini and Padilla, EuroVis 2026): a density
 * curve cut at its quantiles into equal-probability slices, each drawn on its
 * own with a small gap, with one dot per slice at the slice's median.
 *
 * A partition by a key over the variable gives each cell the distribution
 * restricted to the cell: `d.bin(Bin.quantiles(5))` cuts the standard normal
 * at its quintiles, and `field(x).bin(Bin.quantiles(10))` cuts the penguins'
 * body mass at the deciles of its values. In each cell a ribbon of the
 * cell's support and density, drawn in by a few pixels (`inset`), is the
 * cell's slice, and the slices meet where the curve is cut. The last story
 * cuts an area into calendar months the same way: in a month's cell, the
 * ribbon through the rows over `date` is the year's band restricted to the
 * month.
 *
 * The ridgeline still uses the older form: each month's curve laid out on a
 * grid of rows, hidden, and intersected with each cell's region, over the
 * quantile rows of the curve (`quantileRows`). A field's cells are those of
 * the column's whole domain, the same in every month, so
 * `field(x).bin(Bin.quantiles(5))` would cut every month at the year's
 * quintiles, not its own.
 * TODO(stack-profiles): a key for the cells of each group's own sample of a
 * column, so the ridgeline is a partition too.
 */
const meta: Meta = { title: "Forward Syntax/Croissant" };
export default meta;

type Args = { w: number; h: number };

const FILL = "#D1E4F6";
const STROKE = "#467DA8";
// The colors of the paper's "Anatomy of a Croissant Chart" figure.
const PAPER_FILL = "#CBA45F";
const PAPER_STROKE = "#745931";

// The standard normal, cut at its quintiles.
const d = Dist.normal({ mean: "mean", sd: "sd" });

export const Croissant: StoryObj<Args> = {
  args: { w: 480, h: 200 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Croissant",
      description:
        "A croissant chart of the standard normal distribution: the density curve cut at its quintiles into five slices of equal probability, each with a dot at its median, in the colors of the paper's anatomy figure.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart([{ mean: 0, sd: 1 }])
      .flow(partition({ by: d.bin(Bin.quantiles(5)), dir: "x" }))
      .mark(
        layer([
          ribbon({
            x: d.support(),
            h: d.density(),
            inset: 3,
            fill: PAPER_FILL,
            stroke: PAPER_STROKE,
            strokeWidth: 2,
          }),
          circle({ cx: d.median(), cy: 6, r: 3, fill: PAPER_STROKE }),
        ])
      )
      .render(container, {
        w: args.w,
        h: args.h,
        axes: { x: { title: "x" }, y: false },
      });
    return container;
  },
};

// Penguin body mass, a skewed sample with two humps (Gentoo penguins are
// heavier), cut at the deciles of its values.
const mass = field("Body Mass (g)");

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
    chart(penguins.filter((p) => p["Body Mass (g)"] != null))
      .flow(partition({ by: mass.bin(Bin.quantiles(10)), dir: "x" }))
      .mark(
        layer([
          ribbon({
            x: mass.support(),
            h: mass.density(),
            inset: 3,
            fill: FILL,
            stroke: STROKE,
            strokeWidth: 2,
          }),
          circle({ cx: mass.median(), cy: 6, r: 3, fill: STROKE }),
        ])
      )
      .render(container, {
        w: args.w,
        h: args.h,
        axes: { x: { title: "Body mass (g)" }, y: false },
      });
    return container;
  },
};

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
        "A ridgeline of croissant charts, one per month of Seattle's daily high temperatures, each month's density cut at its own quintiles into five equal-probability slices.",
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
        // Each month's row is 34 pixels tall. The height is the row's, so
        // both layers get it: the curve fills it, and so does each cell's
        // region, which is in no cell on y and is as tall as its row.
        layer({ h: 34 }, [
          chart()
            .flow(scatter({ x: "temp_max" }))
            .mark(ribbon({ h: "pdf" }).name("density").hidden()),
        ]).relate(({ density }) => [
          chart()
            .flow(
              derive((rows) =>
                quantileRows(rows, { x: "temp_max", density: "pdf", n: 1000 })
              ),
              partition({
                by: field("temp_max").bin(Bin.quantiles(5)),
                dir: "x",
              })
            )
            .mark(
              layer([
                intersect({ fill: FILL, stroke: STROKE, strokeWidth: 1.5 }, [
                  density,
                  region({ inset: 2 }),
                ]),
                circle({
                  cx: field("temp_max").median(),
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

// Seattle's daily highs in 2012, each the mean of the 15 days centered on it
// (fewer at the ends of the year), with its month's initial.
const days2012 = seattleWeather.filter((d) => d.date.startsWith("2012"));
const highs2012 = days2012.map((d, i) => {
  const window = days2012.slice(Math.max(0, i - 7), i + 8);
  return {
    date: d.date.slice(0, 10),
    letter: months[new Date(d.date).getUTCMonth()][0],
    temp_smooth: window.reduce((s, w) => s + w.temp_max, 0) / window.length,
  };
});
const schema2012 = { date: Unit.time() };

export const SeattleHighsByMonth: StoryObj<Args> = {
  args: { w: 560, h: 220 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Seattle Highs Cut by Month",
      description:
        "A 15-day rolling mean of Seattle's daily highs in 2012, drawn as an area and cut into calendar months, each month a slice as wide as its days with its initial at its median day.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(highs2012, { schema: schema2012 })
      .flow(
        partition({
          by: field("date").bin([Calendar.year, Calendar.month]),
          dir: "x",
        })
      )
      .mark(
        layer([
          ribbon({
            x: "date",
            h: "temp_smooth",
            inset: 2,
            fill: FILL,
            stroke: STROKE,
            strokeWidth: 1.5,
          }),
          text({
            cx: field("date").median(),
            y: 6,
            text: "letter",
            fontSize: 11,
            fill: "#333",
          }),
        ])
      )
      .render(container, {
        w: args.w,
        h: args.h,
        axes: { x: false, y: { title: "Daily high, 15-day mean (°C)" } },
      });
    return container;
  },
};
