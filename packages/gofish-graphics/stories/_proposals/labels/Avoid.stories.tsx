import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, scatter, circle, line, blank } from "../../../src/lib";
import { loadCountries, fit } from "./data";
import { zoomed, afterPaint, readPaths, type Obstacle } from "./place";
import { labelAround } from "./Points.stories";

const meta: Meta = { title: "Proposals/Labels" };
export default meta;

const TREND = "#9e9e9e";

// The scatter plus a least-squares trend line, drawn with today's API:
//   chart(countries)
//     .flow(scatter({ by: "country", x: "fertility", y: "life_expect" }))
//     .mark(circle({ r: 4 }))
//     .layer(chart(trendEnds).flow(scatter({ by: "fertility", x: "fertility", y: "life_expect" })).mark(blank()))
//     .layer(line({ stroke: "#9e9e9e", strokeWidth: 2 }).name("trend"))
const withTrend = (rows: any[]) => {
  const f = fit(rows);
  const xs = rows.map((r) => r.fertility);
  const lo = Math.min(...xs),
    hi = Math.max(...xs);
  const ends = [
    { fertility: lo, life_expect: f(lo) },
    { fertility: hi, life_expect: f(hi) },
  ];
  return chart(rows)
    .flow(scatter({ by: "country", x: "fertility", y: "life_expect" }))
    .mark(circle({ r: 4 }))
    .layer(
      chart(ends)
        .flow(scatter({ by: "fertility", x: "fertility", y: "life_expect" }))
        .mark(blank())
    )
    .layer(line({ stroke: TREND, strokeWidth: 2 }).name("trend"));
};

const avoidStory = (name: string, avoidTrend: boolean): StoryObj => ({
  name,
  loaders: [async () => ({ countries: await loadCountries() })],
  render: (_a: any, ctx: any) => {
    const container = zoomed(initializeContainer(), 1.7);
    const rows = ctx.loaded.countries as any[];
    withTrend(rows).render(container, { w: 560, h: 380 });
    afterPaint(container, (svg) => {
      const trend: Obstacle[] = readPaths(
        svg,
        (el) => el.getAttribute("stroke") === TREND
      ).map((p) => ({ kind: "polyline", pts: p.pts }));
      const out = labelAround(
        svg,
        rows.map((r) => r.country),
        avoidTrend ? trend : []
      );
      console.error(
        `${name} hidden:`,
        rows.filter((_, i) => !out[i]).map((r) => r.country).join(", ")
      );
    });
    return container;
  },
});

// PROPOSED, labels avoid only each other and the labeled dots:
//   .mark(circle({ r: 4 }).label("country", { position: Place.around() }))
export const AvoidMarksOff = avoidStory("avoid-marks-off", false);

// PROPOSED, labels also avoid the trend line:
//   .mark(circle({ r: 4 }).label("country", {
//     position: Place.around(),
//     avoiding: selectAll("trend"),
//   }))
export const AvoidMarksOn = avoidStory("avoid-marks-on", true);
