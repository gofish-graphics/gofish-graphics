// Ridgeline Chart
// A ridgeline chart of Seattle's daily high temperatures by month, with each month's density silhouette overlapping the row above, a thin rule under every baseline, and month names in the left margin instead of a shared y axis.

import {
  Constraint,
  chart,
  field,
  layer,
  rect,
  ribbon,
  scatter,
  spread,
  text,
} from "gofish-graphics";
import { seattleWeather } from "./dataset";
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
const binWidth = 2.5;
const temps = seattleWeather.map((d) => d.temp_max);
const minTemp = Math.floor(Math.min(...temps) / binWidth) * binWidth;
const maxTemp = Math.ceil(Math.max(...temps) / binWidth) * binWidth;
const binCount = Math.round((maxTemp - minTemp) / binWidth);
const binCenters = Array.from(
  { length: binCount },
  (_, i) => minTemp + (i + 0.5) * binWidth,
);
const counts = new Map();
const ridgelineData = monthNames.flatMap((month) =>
  binCenters.map((temp_max, bin) => ({
    month,
    temp_max,
    count: counts.get(`${month}|${bin}`) ?? 0,
  })),
);
const rowPitch = 24;
const labelMarginX = -6;
const container = document.getElementById("app");
chart(ridgelineData, { axes: { x: true, y: false } })
  .flow(
    spread({
      by: field("month").sort(monthNames),
      dir: "y",
      anchor: "baseline",
      spacing: rowPitch,
      h: 330,
      axes: { x: true, y: false },
    }),
    scatter({
      x: "temp_max",
      w: 500,
      axes: { x: true, y: false },
    }),
  )
  .mark(
    ribbon({
      h: "count",
      fill: "steelblue",
      stroke: "white",
      strokeWidth: 1,
      opacity: 0.85,
      mixBlendMode: "normal",
    }),
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
          h: 330,
        }),
      )
      .mark(rect({ h: 1, w: 500, fill: "#999" }).zOrder(-1)),
  )
  .layer(
    layer(
      monthNames.flatMap((month, k) => [
        rect({ w: 0, h: 0, x: labelMarginX, y: rowPitch * k }).name(
          `anchor${k}`,
        ),
        text({
          text: month,
          fontSize: 11,
          fill: "#666",
          y: rowPitch * k - 9,
        }).name(`label${k}`),
      ]),
    ).relate((g) =>
      monthNames.map((_, k) =>
        Constraint.align({ x: "end" }, [g[`label${k}`], g[`anchor${k}`]]),
      ),
    ),
  )
  .render(container, {
    w: 500,
    h: 330,
  });
