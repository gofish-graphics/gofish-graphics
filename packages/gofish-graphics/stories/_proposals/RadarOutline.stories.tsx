import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Color,
  Coord,
  Curve,
  chart,
  circle,
  group,
  layer,
  line,
  polygon,
  rect,
  scatter,
  selectAll,
} from "../../src/lib";

// A radar chart: points in a polar space (one spoke per metric around a
// full turn, the radius from the value), joined by STRAIGHT edges in a
// layer outside the polar space, in a closed ring. A mark outside a
// coordinate space reads a mark inside it where the space draws it, so the
// ring runs through the points on the screen and its edges stay straight.
const meta: Meta = {
  title: "Proposals/Radar Outline",
  excludeStories: /^[a-z]/,
};
export default meta;

const metrics = ["speed", "power", "range", "armor", "agility", "stealth"];
const A = [8, 6, 9, 4, 7, 5];
const B = [5, 9, 4, 8, 3, 7];
const rows = metrics.map((metric, i) => ({ metric, value: A[i] }));
const both = [
  ...metrics.map((metric, i) => ({ series: "A", metric, value: A[i] })),
  ...metrics.map((metric, i) => ({ series: "B", metric, value: B[i] })),
];
// One spoke per metric, out to the top of the scale. A spoke's length is an
// amount, measured from radius 0, so the spokes also start the radial scale
// at 0: without them it starts at the least value (see the report on
// `scatter` in polar).
const spokes = metrics.map((metric) => ({ metric, max: 10 }));
// The grid: a ring of invisible points per level, joined by a polygon.
const levels = [2, 4, 6, 8, 10].flatMap((level) =>
  metrics.map((metric) => ({ metric, level }))
);
type Row = { metric: string; value: number };

const W = 320;
const INK = "#1d3557";
const RED = "#e63946";
const GRID = "#d0d4d9";

// ─────────────────────────────────────────────────────────────────────────
// The radar
// ─────────────────────────────────────────────────────────────────────────

/** One series: the points in the polar space, named; the ring through them
 *  in a layer outside it. */
export const Radar: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ w: W, h: W }, [
      layer({ coord: Coord.clock() }, [
        chart(spokes)
          .flow(scatter({ by: "metric", x: "metric" }))
          .mark(rect({ w: 0, h: "max", stroke: GRID, strokeWidth: 1 })),
        chart(rows)
          .flow(scatter({ by: "metric", x: "metric", y: "value" }))
          .mark(circle({ r: 4, fill: INK }).name("pts")),
      ]),
      // `opacity` is the whole polygon's, its stroke's too, so a crisp
      // outline over a faint fill is a second polygon.
      chart(selectAll("pts")).mark(polygon({ fill: INK, opacity: 0.25 })),
      chart(selectAll("pts")).mark(
        polygon({ fill: "none", stroke: INK, strokeWidth: 2 })
      ),
    ]).render(container);
    return container;
  },
};

/** Two series: the points grouped by series in the polar space, and one
 *  ring per series outside it, over a hexagonal grid drawn the same way. */
export const RadarTwoSeries: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ w: W, h: W }, [
      layer({ coord: Coord.clock() }, [
        chart(spokes)
          .flow(scatter({ by: "metric", x: "metric" }))
          .mark(rect({ w: 0, h: "max", stroke: GRID, strokeWidth: 1 })),
        chart(levels)
          .flow(
            group({ by: "level" }),
            scatter({ by: "metric", x: "metric", y: "level" })
          )
          .mark(circle({ r: 0 }).name("grid")),
        chart(both, { color: Color.palette([INK, RED]) })
          .flow(
            group({ by: "series" }),
            scatter({ by: "metric", x: "metric", y: "value" })
          )
          .mark(circle({ r: 4, fill: "series" }).name("pts")),
      ]),
      chart(selectAll("grid"))
        .flow(group({ by: "level" }))
        .mark(polygon({ fill: "none", stroke: GRID, strokeWidth: 1 })),
      chart(selectAll("pts"))
        .flow(group({ by: "series" }))
        .mark(polygon({ fill: "series", opacity: 0.2 })),
      chart(selectAll("pts"))
        .flow(group({ by: "series" }))
        .mark(polygon({ fill: "none", stroke: "series", strokeWidth: 2 })),
    ]).render(container);
    return container;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Regressions and contrasts
// ─────────────────────────────────────────────────────────────────────────

/** The outline inside the polar space: each segment is warped into an arc,
 *  and the loop is open (no segment from "stealth" back to "speed"). */
export const InsideCoord: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { coord: Coord.clock(), w: W, h: W })
      .flow(scatter({ by: "metric", x: "metric", y: "value" }))
      .mark(circle({ r: 4, fill: INK }))
      .layer(line({ stroke: INK, strokeWidth: 2 }))
      .render(container);
    return container;
  },
};

/** The same with `curve: Curve.linear()`: the curve is read before the
 *  coordinate transform, so the segments are still arcs. */
export const InsideCoordLinear: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { coord: Coord.clock(), w: W, h: W })
      .flow(scatter({ by: "metric", x: "metric", y: "value" }))
      .mark(circle({ r: 4, fill: INK }))
      .layer(line({ stroke: INK, strokeWidth: 2, curve: Curve.linear() }))
      .render(container);
    return container;
  },
};

/** The points in the polar space, named; a `line` in a layer outside it,
 *  through `selectAll`. It runs straight through the points where they are
 *  drawn. A line is open: there is no segment from the last point back to
 *  the first. */
export const OutsideOpen: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ w: W, h: W }, [
      layer({ coord: Coord.clock() }, [
        chart(rows)
          .flow(scatter({ by: "metric", x: "metric", y: "value" }))
          .mark(circle({ r: 4, fill: INK }).name("pts")),
      ]),
      chart(selectAll("pts")).mark(
        line({ stroke: RED, strokeWidth: 2, curve: Curve.linear() })
      ),
    ]).render(container);
    return container;
  },
};

/** The same crossing through `.relate`: each polar point named by its
 *  metric, and a `line` over refs to them, the last back to the first. */
export const OutsideRefs: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ w: W, h: W }, [
      layer({ coord: Coord.clock() }, [
        chart(rows)
          .flow(scatter({ by: "metric", x: "metric", y: "value" }))
          .mark((d: Row[]) => circle({ r: 4, fill: INK }).name(d[0].metric)),
      ]),
    ])
      .relate((c: any) => [
        line({ stroke: RED, strokeWidth: 2, curve: Curve.linear() }, [
          ...metrics.map((m) => c[m]),
          c[metrics[0]],
        ]),
      ])
      .render(container);
    return container;
  },
};

/** `polygon` over refs in `.relate`: the ring through the named points,
 *  closed by the polygon itself. */
export const PolygonRefs: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ w: W, h: W }, [
      layer({ coord: Coord.clock() }, [
        chart(rows)
          .flow(scatter({ by: "metric", x: "metric", y: "value" }))
          .mark((d: Row[]) => circle({ r: 4, fill: INK }).name(d[0].metric)),
      ]),
    ])
      .relate((c: any) => [
        polygon(
          { fill: RED, opacity: 0.25, stroke: RED, strokeWidth: 2 },
          metrics.map((m) => c[m])
        ),
      ])
      .render(container);
    return container;
  },
};

/** `polygon` over marks INSIDE the polar space: its edges are drawn
 *  through the space as a line's are, so they curve. */
export const PolygonInsideCoord: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { coord: Coord.clock(), w: W, h: W })
      .flow(scatter({ by: "metric", x: "metric", y: "value" }))
      .mark(circle({ r: 4, fill: INK }))
      .layer(polygon({ fill: RED, opacity: 0.25 }))
      .render(container);
    return container;
  },
};
