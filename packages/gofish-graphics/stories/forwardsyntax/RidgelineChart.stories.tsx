import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seattleWeather } from "../../src/data/seatle-weather";
import { chart, spread, scatter, field, rect, text, layer, Constraint } from "../../src/lib";
import { ribbon } from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax V3/Ridgeline Chart",
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

// Fixed row-to-row pitch shared by the ridge spread and the label spread
// below, so a month's rule+label always sit at the same baseline as its
// silhouette. Both tiers chain their rows with `anchor: "baseline"` at this
// pitch, and both rows put their semantic baseline at local 0 (the ribbon's
// zero-count line; the rule), so the two chains solve to identical lines.
const rowPitch = 24;

// Right-aligning the month labels (issue #757: `text` has no textAnchor —
// it always anchors "start") is done with a constraint instead of a
// hardcoded per-string pixel-width table: each row gets a zero-size
// invisible anchor rect at the fixed x just left of the plot edge, and
// `Constraint.align({ x: "end" }, [label, anchor])` pins the label's END
// (using the text mark's own LAYOUT-TIME measured width) to the anchor's
// end — which, for a zero-width box, is just its `x`. This is the
// bottle-chart pattern (`stories/piccl/Bottle.stories.tsx`); it uses real
// measured glyph widths so JS and Python need no shared precomputed table.
const labelMarginX = -6;

export const Default: StoryObj<Args> = {
  args: { w: 500, h: 330 },
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

    chart(ridgelineData, { axes: { x: true, y: false } })
      .flow(
        spread({
          by: field("month").sort(monthNames),
          dir: "y",
          anchor: "baseline",
          spacing: rowPitch,
          h: args.h,
          axes: { x: true, y: false },
        }),
        scatter({
          x: "temp_max",
          w: args.w,
          axes: { x: true, y: false },
        })
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
      // thin rule along each month's baseline with the month name sticking
      // out to the LEFT of the plot (tick-label style), instead of a standard
      // y axis that can't line up with 12 overlapping, unevenly-tall
      // silhouettes. Two extra tiers:
      //
      //  - RULES: the same fixed-pitch baseline spread as the ridges, marking
      //    a bare rect per month. The rect sits at its row's baseline anchor,
      //    so it registers exactly on the ribbon's zero line. `.zOrder(-1)`
      //    paints the rules BEHIND the ribbons — visible only outside the
      //    silhouettes, the classic look.
      //  - LABELS: a datumless annotation overlay (a bare mark tier — no
      //    flow), one text per month at literal frame coordinates. This is
      //    deliberate: a spread-laid row normalizes away any extent above or
      //    left of its baseline anchor, so a label can never overhang its own
      //    row — but a bare tier shares the frame origin and CAN reach into
      //    the canvas margin (the render's overhang reserve), exactly like
      //    the ridge peaks reach above the first baseline. Each label's END
      //    is constraint-aligned to a same-row invisible anchor rect fixed at
      //    `labelMarginX` (6px left of the plot edge) — see `labelMarginX`'s
      //    comment; y = k·pitch − 9 puts the glyph baseline on the rule.
      .layer(
        chart(monthNames.map((month) => ({ month })))
          .flow(
            spread({
              by: field("month").sort(monthNames),
              dir: "y",
              anchor: "baseline",
              spacing: rowPitch,
              h: args.h,
            })
          )
          .mark(rect({ h: 1, w: args.w, fill: "#999" }).zOrder(-1))
      )
      .layer(
        layer(
          monthNames.flatMap((month, k) => [
            rect({ w: 0, h: 0, x: labelMarginX, y: rowPitch * k }).name(
              `anchor${k}`
            ),
            text({
              text: month,
              fontSize: 11,
              fill: "#666",
              y: rowPitch * k - 9,
            }).name(`label${k}`),
          ])
        ).constrain((g) =>
          monthNames.map((_, k) =>
            Constraint.align({ x: "end" }, [g[`label${k}`], g[`anchor${k}`]])
          )
        )
      )
      .render(container, {
        w: args.w,
        h: args.h,
      });

    return container;
  },
};
