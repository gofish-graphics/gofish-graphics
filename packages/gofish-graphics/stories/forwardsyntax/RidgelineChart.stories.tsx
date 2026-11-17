import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seattleWeather } from "../../src/data/seatle-weather";
import { chart, spread, layer, field, rect, datum, Unit } from "../../src/lib";
import { ribbon } from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax/Ridgeline Chart",
  argTypes: {
    w: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
  },
};
export default meta;

type Args = { w: number };

const monthNames = [
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

// Classic "temperature distributions by month" ridgeline: each month's
// density of daily highs (across all four years), a kernel density over
// that month's days.
const days = seattleWeather.map((d) => ({
  ...d,
  month: monthNames[new Date(d.date).getUTCMonth()],
}));
// The rules under the ridges run across the whole x axis, past the tails
// of every month's density (each runs three bandwidths past its month's
// days), so each month's name sits left of every ridge.
const ruleFrom = -10;
const ruleTo = 40;

// Fixed row-to-row pitch shared by the ridge spread and the rule spread
// below, so a month's rule and label sit at the same baseline as its
// silhouette. Both tiers chain their rows with `anchor: "baseline"` at this
// pitch, and both rows put their semantic baseline at local 0 (the ribbon's
// zero-count line; the rule), so the two chains solve to identical lines.
const rowPitch = 24;

// Each month's section is a fixed height: the tallest ridge (the largest
// density) is this many px, whatever the width, the pitch or the number of
// months. The ridges overlap because it is far more than `rowPitch`, and the
// chart's height follows from the sections, so the chart sets no `h`.
const ridgeHeight = 140;

export const Default: StoryObj<Args> = {
  args: { w: 500 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Ridgeline Chart",
      description:
        "A ridgeline chart of Seattle's daily high temperatures by month, with each month's density silhouette overlapping the row above, a thin rule under every baseline, and month names in the left margin instead of a shared y axis.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    const temp = field("temp_max");
    chart(days, {
      axes: { x: true, y: false },
      schema: { temp_max: { name: "Max temperature", unit: Unit("°C") } },
      w: args.w,
    })
      .flow(
        spread({
          by: field("month").sort(monthNames),
          dir: "y",
          anchor: "baseline",
          spacing: rowPitch,
        })
      )
      .mark(
        layer({ h: ridgeHeight }, [
          ribbon({
            x: temp.support(),
            h: temp.density(),
            fill: "steelblue",
            stroke: "white",
            strokeWidth: 1,
            opacity: 0.85,
            blendMode: "normal",
          }),
        ])
      )
      // Per-row baseline labeling, in the style of a ggridges ridgeline: a
      // thin rule along each month's baseline with the month name to the
      // LEFT of the plot (tick-label style), instead of a standard y axis
      // that can't line up with 12 overlapping, unevenly-tall silhouettes.
      // The rules are the same fixed-pitch baseline spread as the ridges, a
      // bare rect per month, so each registers exactly on its ribbon's zero
      // line. Each rule spans the x axis. Each rule carries its month as a
      // label outside its left end, standing on the rule. `.zOrder(-1)` paints the rules BEHIND the
      // ribbons, visible only outside the silhouettes, the classic look.
      .layer(
        chart(monthNames.map((month) => ({ month })))
          .flow(
            spread({
              by: field("month").sort(monthNames),
              dir: "y",
              anchor: "baseline",
              spacing: rowPitch,
            })
          )
          .mark(
            rect({
              x: datum(ruleFrom),
              w: datum(ruleTo - ruleFrom),
              h: 1,
              fill: "#999",
            }).label("month", {
              position: "outset-left-end",
              fontSize: 11,
              color: "#666",
            })
          )
          .zOrder(-1)
      )
      .render(container);

    return container;
  },
};
