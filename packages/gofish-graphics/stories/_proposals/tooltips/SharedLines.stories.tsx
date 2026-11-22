/**
 * PROTOTYPE(#1395): several series over time, ONE tooltip for every series
 * at the x nearest the pointer (Plotly's "x unified", ECharts' trigger
 * "axis"). In GoFish it is the default tooltip applied to a different GROUP:
 * the points named "pts", grouped by `year`, filtered to the focused year.
 * The group is every mark that shares that x; the box lists its members.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  scatter,
  group,
  line,
  circle,
  rect,
  selectAll,
  filter,
  enclose,
  live,
} from "../../../src/lib";
import { unemployment } from "../../../src/data/unemployment";
import { box, table, beside, thousands } from "./helpers";
import { snap } from "./focusRuntime";

// The lowercase and all-caps exports are builders, data and mounts, not stories.
const meta: Meta = {
  title: "Proposals/Tooltips/Shared Line Tooltip",
  excludeStories: /^([a-z]|[A-Z_]+$)/,
};
export default meta;

const SERIES = [
  "Wholesale and Retail Trade",
  "Manufacturing",
  "Construction",
  "Finance",
];

/** Yearly mean of the monthly counts, 2000-2009: `{ series, year, count }`. */
export const yearly = SERIES.flatMap((series) => {
  const out: { series: string; year: number; count: number }[] = [];
  for (let year = 2000; year <= 2009; year++) {
    const months = unemployment.filter(
      (d) => d.series === series && d.date.startsWith(String(year))
    );
    const count = months.reduce((t, d) => t + d.count, 0) / months.length;
    out.push({ series, year, count: Math.round(count) });
  }
  return out;
});
const TOP = Math.max(...yearly.map((d) => d.count));
const YEARS = [...new Set(yearly.map((d) => d.year))];

/** The chart's own size, for the static stories. */
export const SIZE = { w: 520, h: 300 };
/** A render size, used only by the Measure stories, which ran before the
 *  live story switched to reading positions off the drawn marks. WALL: `pointer().dataPos()` converts
 *  nothing when the chart has a size of its own, and a render-sized chart
 *  with a tier that claims nothing (the closed tooltip, or an ink box) draws
 *  its axes past the canvas. See NOTES.md. */
export const CANVAS = { w: 760, h: 340 };

/**
 * `ping`, in the live story, reads the pointer inside the rule's `live()`
 * opacity, a paint-only read whose only job is to register the pointer with
 * the chart (a read outside any spec registers nothing). A `live()` read on
 * the lines' opacity did not register it.
 */
export function sharedLines(
  focus: () => number | undefined,
  ping?: () => unknown,
  size: { w?: number; h?: number } = SIZE
) {
  // The rule is hidden with no focus. Its opacity is set when the chart is
  // built, or read at paint time in the live story.
  const ruleOpacity = ping
    ? live(() => (ping(), focus() === undefined ? 0 : 1))
    : focus() === undefined
      ? 0
      : 1;
  return (
    chart(yearly, {
      ...size,
      axes: { x: { title: false }, y: { title: "Unemployed (thousands)" } },
    })
      .flow(group({ by: "series" }))
      .mark(line({ x: "year", y: "count", stroke: "series", strokeWidth: 2 }))
      // The rule: a 1px rect at the focused year, from 0 to the top of the
      // data. With no focus it is still drawn (at the first year, hidden), so
      // the y axis keeps its 0 whether a year is focused or not. A rule
      // present only while open moved the plot on the first hover. The year
      // is picked by a `filter`, which runs on every resolve.
      .layer(
        chart(YEARS.map((year) => ({ year, top: TOP })))
          .flow(
            filter((d: any) => d.year === (focus() ?? YEARS[0])),
            scatter({ by: "year", x: "year" })
          )
          .mark(rect({ w: 1, h: "top", fill: "#9ca3af", opacity: ruleOpacity as any }))
      )
      // A point per row, named so the tooltip can select them; drawn only at
      // the focused year (the "dot on each line").
      .layer(
        chart(yearly)
          .flow(scatter({ x: "year", y: "count" }))
          .mark(
            circle({
              r: 4,
              fill: "series",
              stroke: "white",
              strokeWidth: 1.5,
              opacity: (d: any) => (d.year === focus() ? 1 : 0),
            }).name("pts")
          )
      )
      // The tooltip: the group of points that share the focused x.
      .layer(
        chart(selectAll("pts"))
          .flow(
            filter((pt: any) => pt.datum[0].year === focus()),
            group({ by: "year" })
          )
          .mark(((pts: any[]) => {
            const rows = pts
              .map((pt) => pt.datum[0])
              .sort((a, b) => b.count - a.count);
            const anchor = Promise.resolve(
              enclose({ padding: 6, fill: "none", stroke: "none" } as any, pts)
            ).then((n: any) => n.zOrder(1));
            return beside(
              anchor,
              box(
                table(
                  rows.map((r): [string, string] => [r.series, thousands(r.count)]),
                  { title: String(rows[0].year) }
                )
              ),
              // Keep it inside: past the middle year it opens to the left.
              { side: rows[0].year > 2005 ? "left" : "right" }
            );
          }) as any)
      )
  );
}

export const Pinned: StoryObj = {
  render: () => {
    const container = initializeContainer();
    sharedLines(() => 2003).render(container);
    return container;
  },
};

export const Closed: StoryObj = {
  render: () => {
    const container = initializeContainer();
    sharedLines(() => undefined).render(container);
    return container;
  },
};

/**
 * Live. The focus is the year nearest the pointer, by the same default rule
 * as every other story: a year's candidate is its column of dots (`r: 4`,
 * invisible except at the focused year; the dots share the key `year`), and
 * the hull is over the dots, which cover the lines. So the pointer never has
 * to be on a line. The pointer is registered by `ping`. Shared by the
 * Interactive story and the proposal page's demo bundle
 * (proposals/tooltips/demo).
 */
export function mountInteractive(container: HTMLElement) {
  const { focus: year, ping } = snap(container, {
    selector: 'ellipse[rx="4"]',
    count: yearly.length,
    // A year's position is the `x` channel; its dots differ in y, so y drops out.
    position: ["x"],
    key: (r) => r?.year,
  });
  return sharedLines(year, ping).render(container);
}

export const Interactive: StoryObj = {
  render: () => {
    const container = initializeContainer();
    mountInteractive(container);
    return container;
  },
};
