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
  pointer,
  live,
} from "../../../src/lib";
import { unemployment } from "../../../src/data/unemployment";
import { box, table, beside, focusFrom, thousands } from "./helpers";

const meta: Meta = { title: "Proposals/Tooltips/Shared Line Tooltip" };
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
/** The canvas of the live story. WALL: there the size goes to `render`, not
 *  `chart`, because `pointer().dataPos()` converts nothing when the chart
 *  has a size of its own; and a render-sized chart with a tier that claims
 *  nothing (the closed tooltip, or an ink box) draws its axes past the
 *  canvas. See NOTES.md. */
export const CANVAS = { w: 760, h: 340 };

export function sharedLines(
  focus: () => number | undefined,
  lineOpacity: any = 1,
  size: { w?: number; h?: number } = SIZE
) {
  return (
    chart(yearly, {
      ...size,
      axes: { x: { title: false }, y: { title: "Unemployed (thousands)" } },
    })
      .flow(group({ by: "series" }))
      .mark(
        line({
          x: "year",
          y: "count",
          stroke: "series",
          strokeWidth: 2,
          opacity: lineOpacity,
        })
      )
      // The rule: one 1px rect per year, from 0 to the top of the data, kept
      // only for the focused year.
      .layer(
        chart(
          YEARS.filter((y) => y === focus()).map((year) => ({ year, top: TOP }))
        )
          .flow(scatter({ by: "year", x: "year" }))
          .mark(rect({ w: 1, h: "top", fill: "#9ca3af" }))
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
 * Live. The focus is the year NEAREST the pointer's data x
 * (`pointer().dataPos()`), not a hit-test, so the pointer never has to be on
 * a line, and a box under the cursor cannot steal the focus. The pointer is
 * registered by a `live()` read on the lines' opacity.
 */
export const Interactive: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const p = pointer();
    const nearestYear = () => {
      const x = p.dataPos()?.x;
      if (x === undefined) return undefined;
      return YEARS.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
    };
    const year = focusFrom(nearestYear);
    // `live(() => 1)` that reads the pointer: a paint-only read whose only
    // job is to register the pointer with the chart (a read outside any spec
    // registers nothing).
    sharedLines(year, live(() => (p.pos(), 1)), {}).render(container, CANVAS);
    return container;
  },
};
