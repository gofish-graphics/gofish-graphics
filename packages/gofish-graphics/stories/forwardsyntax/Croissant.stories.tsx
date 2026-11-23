import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Binning,
  Calendar,
  chart,
  circle,
  derive,
  Dist,
  field,
  kde,
  layer,
  partition,
  ribbon,
  spread,
  text,
  Unit,
  Spacing,
} from "../../src/lib";
import { penguins } from "../../src/data/penguins";
import { seattleWeather } from "../../src/data/seatle-weather";

/**
 * Croissant charts (Fygenson, Bertini and Padilla, EuroVis 2026): a density
 * curve cut at its quantiles into equal-probability slices, each drawn on its
 * own with a small gap, with one dot per slice at the slice's median.
 *
 * A partition by a key over a distribution gives each cell the
 * distribution restricted to the cell: `d.bin(Binning.quantiles(5))` cuts the
 * standard normal at its quintiles. `derive(kde(x))` smooths the rows into
 * a kernel density that the column then holds, and
 * `field(x).bin(Binning.quantiles(n))` cuts it at its own quantiles: the
 * penguins' body mass at its deciles, and in the ridgeline each month's
 * highs at the month's own quintiles, since the kde runs in each month. In
 * each cell a ribbon of the cell's domain and density, drawn in by a few
 * pixels (`inset`), is the cell's slice, and the slices meet where the curve
 * is cut. The last story cuts an area into calendar months the same way: in
 * a month's cell, the ribbon through the rows over `date` is the year's band
 * restricted to the month.
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
      .flow(partition({ by: d.bin(Binning.quantiles(5)), dir: "x" }))
      .mark(
        layer([
          ribbon({
            x: d.domain(),
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
// heavier), smoothed into a kernel density and cut at its deciles.
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
    chart(penguins)
      .flow(
        derive(kde("Body Mass (g)")),
        partition({ by: mass.bin(Binning.quantiles(10)), dir: "x" })
      )
      .mark(
        layer([
          ribbon({
            x: mass.domain(),
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

// Seattle's daily highs, each with its month.
const highs = seattleWeather.map((d) => ({
  month: months[new Date(d.date).getUTCMonth()],
  temp_max: d.temp_max,
}));
const temp = field("temp_max");

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
    chart(highs, {
      w: args.w,
      axes: { x: { title: "Daily high (°C)" }, y: false },
    })
      .flow(
        spread({
          by: field("month").sort(months),
          dir: "y",
          spacing: Spacing.pitch(36, { at: "baseline" }),
        }),
        derive(kde("temp_max")),
        partition({ by: temp.bin(Binning.quantiles(5)), dir: "x" })
      )
      .mark(
        layer({ h: 34 }, [
          ribbon({
            x: temp.domain(),
            h: temp.density(),
            inset: 2,
            fill: FILL,
            stroke: STROKE,
            strokeWidth: 1.5,
          }),
          circle({ cx: temp.median(), cy: 5, r: 2.25, fill: STROKE }),
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
