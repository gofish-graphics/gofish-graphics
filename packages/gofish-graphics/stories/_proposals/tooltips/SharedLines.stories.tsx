/**
 * PROTOTYPE(#1395): several series over time, two tooltips. The live one is
 * one line's, snapped to its row nearest the pointer (`lineRows`), as
 * version 1 builds it. The static one is proposed and not built: ONE
 * tooltip for every series at the x nearest the pointer (Plotly's "x
 * unified", ECharts' trigger "axis"), `.tooltip({ by: "year" })`. It is the
 * default tooltip applied to a different GROUP: the points named "pts",
 * grouped by `year`, filtered to the focused year (`sharedLines`).
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
import { box, table, beside, thousands, rowTooltip, rowOf } from "./helpers";
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

/** The key of a row's point: its series and year. */
export const rowKey = (r: { series: string; year: number } | undefined) =>
  r && `${r.series}|${r.year}`;

/**
 * One line's tooltip, snapped to the row nearest the pointer: what
 * `line(...).tooltip()` does in version 1 (draft PR #1401). The box shows
 * the focused row's fields beside its point, with a marker on the point in
 * the line's color. `focus` is the focused row's key (`rowKey`).
 *
 * The points are a layer of circles drawn at the rows, placed by the same
 * `scatter` of the same fields as the lines. Each is hidden except the
 * focused one, which is the marker. The live story reads the rows' points
 * off them (`snap`'s `points`, focusRuntime.ts), because a line does not
 * expose where it drew each row to user code. `ping`, in the live story,
 * reads the pointer inside their `live()` opacity, which registers it.
 */
export function lineRows(
  focus: () => string | undefined,
  ping?: () => unknown,
  size: { w?: number; h?: number } = SIZE
) {
  const shown = (d: any) => (rowKey(rowOf<any>(d)) === focus() ? 1 : 0);
  return chart(yearly, {
    ...size,
    axes: { x: { title: false }, y: { title: "Unemployed (thousands)" } },
  })
    .flow(group({ by: "series" }))
    .mark(line({ x: "year", y: "count", stroke: "series", strokeWidth: 2 }).name("lines"))
    .layer(
      chart(yearly)
        .flow(scatter({ x: "year", y: "count" }))
        .mark(
          circle({
            r: 4,
            fill: "series",
            stroke: "white",
            strokeWidth: 1.5,
            opacity: ping ? live((d: any) => (ping(), shown(d))) : shown,
          }).name("pts")
        )
    )
    .layer(
      chart(selectAll("pts"))
        .flow(
          filter((pt: any) => rowKey(pt.datum[0]) === focus()),
          group({ by: "series" })
        )
        .mark(((pt: any[]) => {
          const row = pt[0].datum[0];
          return beside(
            pt[0],
            rowTooltip(row, { format: { year: String, count: thousands } }),
            // Keep it inside: past the middle year it opens to the left.
            { side: row.year > 2005 ? "left" : "right" }
          );
        }) as any)
    );
}

/** Static capture: the row of Construction at 2006 focused. */
export const PinnedRow: StoryObj = {
  render: () => {
    const container = initializeContainer();
    lineRows(() => "Construction|2006").render(container);
    return container;
  },
};

/**
 * Live, by the same default rule as every other story: each line is one
 * candidate, as near as its path, and the focused line snaps to its row
 * nearest the pointer. Shared by the Interactive story and the proposal
 * page's demo bundle (proposals/tooltips/demo).
 */
export function mountInteractive(container: HTMLElement) {
  const { focus: row, ping } = snap(container, {
    // The lines: the stroked paths the chart draws for its marks.
    selector: 'path[data-gf-id][fill="none"]',
    count: SERIES.length,
    // A line is drawn across its rows: it has no placed position.
    position: [],
    key: (r) => r?.series,
    points: {
      selector: 'ellipse[rx="4"]',
      count: yearly.length,
      key: rowKey,
      line: (r) => r?.series,
    },
  });
  return lineRows(row, ping).render(container);
}

export const Interactive: StoryObj = {
  render: () => {
    const container = initializeContainer();
    mountInteractive(container);
    return container;
  },
};
