import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seattleWeather } from "../../src/data/seatle-weather";
import {
  chart,
  spread,
  scatter,
  field,
  rect,
  datum,
  Schema,
} from "../../src/lib";
import { ribbon } from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax/Ridgeline Chart",
  argTypes: {
    w: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
    h: {
      control: { type: "number", min: 100, max: 1000, step: 10 },
    },
  },
};
export default meta;

type Args = { w: number; h: number };

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

// Classic "temperature distributions by month" ridgeline: bin every day's
// high temperature (across all four years) into fixed-width buckets shared
// by every month, then count days per (month, bucket). Zero-count buckets
// are included at both ends of each month's range so every ridge returns to
// its own baseline instead of getting clipped mid-slope.
const binWidth = 2.5;
const temps = seattleWeather.map((d) => d.temp_max);
const minTemp = Math.floor(Math.min(...temps) / binWidth) * binWidth;
const maxTemp = Math.ceil(Math.max(...temps) / binWidth) * binWidth;
const binCount = Math.round((maxTemp - minTemp) / binWidth);
const binCenters = Array.from(
  { length: binCount },
  (_, i) => minTemp + (i + 0.5) * binWidth
);

const counts = new Map<string, number>();
for (const d of seattleWeather) {
  const month = monthNames[new Date(d.date).getUTCMonth()];
  const bin = Math.min(
    binCount - 1,
    Math.floor((d.temp_max - minTemp) / binWidth)
  );
  const key = `${month}|${bin}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

const ridgelineData = monthNames.flatMap((month) =>
  binCenters.map((temp_max, bin) => ({
    month,
    temp_max,
    count: counts.get(`${month}|${bin}`) ?? 0,
  }))
);

// Fixed row-to-row pitch shared by the ridge spread and the rule spread
// below, so a month's rule and label sit at the same baseline as its
// silhouette. Both tiers chain their rows with `anchor: "baseline"` at this
// pitch, and both rows put their semantic baseline at local 0 (the ribbon's
// zero-count line; the rule), so the two chains solve to identical lines.
const rowPitch = 24;

export const Default: StoryObj<Args> = {
  args: { w: 500, h: 380 },
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

    chart(ridgelineData, {
      axes: { x: true, y: false },
      schema: { temp_max: Schema.quantity("Max temperature").unit("°C") },
      w: args.w,
      h: args.h,
    })
      .flow(
        spread({
          by: field("month").sort(monthNames),
          dir: "y",
          anchor: "baseline",
          spacing: rowPitch,
        }),
        scatter({ x: "temp_max" })
      )
      .mark(
        ribbon({
          h: "count",
          fill: "steelblue",
          stroke: "white",
          strokeWidth: 1,
          opacity: 0.85,
          mixBlendMode: "normal",
        })
      )
      // Per-row baseline labeling, in the style of a ggridges ridgeline: a
      // thin rule along each month's baseline with the month name to the
      // LEFT of the plot (tick-label style), instead of a standard y axis
      // that can't line up with 12 overlapping, unevenly-tall silhouettes.
      // The rules are the same fixed-pitch baseline spread as the ridges, a
      // bare rect per month, so each registers exactly on its ribbon's zero
      // line. Each rule spans the ribbon's run, from the first bin's center
      // to the last's, so the ribbon's white outline lies along the whole
      // rule. Each rule carries its month as a label outside its left end,
      // standing on the rule. `.zOrder(-1)` paints the rules BEHIND the
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
              x: datum(binCenters[0]),
              w: datum(binCenters[binCount - 1] - binCenters[0]),
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
