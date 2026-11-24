import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Coord,
  Curve,
  Spacing,
  chart,
  circle,
  fr,
  layer,
  line,
  polygon,
  rect,
  ribbon,
  scatter,
  selectAll,
  spread,
} from "../../src/lib";

// A radar chart: points in a polar space (one spoke per metric around a
// full turn, the radius from the value), joined by STRAIGHT segments in a
// layer outside the polar space, in a closed loop. This file probes how far
// today's public API gets. Stories marked PROTOTYPE draw the intended
// picture by computing in story code what a missing piece would do; their
// PROPOSED spelling is in the comment above them. Not gallery-tagged.
const meta: Meta = {
  title: "Proposals/Radar Outline",
  excludeStories: /^[a-z]/,
};
export default meta;

const metrics = ["speed", "power", "range", "armor", "agility", "stealth"];
const A = [8, 6, 9, 4, 7, 5];
const B = [5, 9, 4, 8, 3, 7];
const rows = metrics.map((metric, i) => ({ metric, value: A[i] }));
type Row = { metric: string; value: number };

const W = 320;
const INK = "#1d3557";
const RED = "#e63946";

// ─────────────────────────────────────────────────────────────────────────
// 1. What today's API draws
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

/** The points in the polar space, named; the outline in a layer outside
 *  it, through `selectAll`. */
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
 *  metric, and a `line` over refs to them, the last back to the first
 *  (the form of `treeLinks` in MinimumGap.stories). */
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

/** The spokes alone: a spread with a pitch of one share around the closed
 *  full turn. Six spokes land a sixth of a turn apart, the first at 12
 *  o'clock; each is a thin bar whose length is its value, from 0. */
export const PitchSpokes: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { coord: Coord.clock(), w: W, h: W })
      .flow(
        spread({
          by: "metric",
          dir: "x",
          spacing: Spacing.pitch(fr(1), { at: "middle" }),
        })
      )
      .mark(rect({ w: 0.02, h: "value", fill: INK }))
      .render(container);
    return container;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 2. Candidates for closing the loop, with what exists today
// ─────────────────────────────────────────────────────────────────────────

/** (a) Repeat the first datum at the end. The repeated row has the same
 *  metric, so it joins the "speed" group: there is no seventh point for the
 *  line to end on, and the loop stays open. */
export const RepeatFirst: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart([...rows, rows[0]], { coord: Coord.clock(), w: W, h: W })
      .flow(scatter({ by: "metric", x: "metric", y: "value" }))
      .mark(circle({ r: 4, fill: INK }))
      .layer(line({ stroke: INK, strokeWidth: 2, curve: Curve.linear() }))
      .render(container);
    return container;
  },
};

/** (c) `ribbon` in its connector form over the spokes: a band between each
 *  pair of neighboring bars, warped by the polar space, and none from the
 *  last bar back to the first. */
export const RibbonBetweenSpokes: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(rows, { coord: Coord.clock(), w: W, h: W })
      .flow(
        spread({
          by: "metric",
          dir: "x",
          spacing: Spacing.pitch(fr(1), { at: "middle" }),
        })
      )
      .mark(rect({ w: 0.02, h: "value", fill: INK }))
      .layer(ribbon({ fill: RED, opacity: 0.3, curve: Curve.linear() }))
      .render(container);
    return container;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 3. PROTOTYPES: the intended pictures, computed in story code
// ─────────────────────────────────────────────────────────────────────────
//
// Two things are missing: (1) a mark outside a coordinate space that reads
// a named mark inside it at its SCREEN position (today it reads it in the
// space's own frame: angle in radians on x, radius on y), and (2) a way to
// close the loop. The prototypes stand in for both. `toScreen` is what a
// ref across the coord boundary should yield: the point's place on screen
// under `Coord.clock()`, k/n of a turn clockwise from 12 o'clock at radius
// `value`. Every mark below is drawn through the public API (`polygon`
// with literal pixel points), but the geometry is computed here.

const C = W / 2; // center
const PX = (W / 2 - 10) / 10; // pixels per unit, values 0..10
const toScreen = (value: number, k: number, n: number): [number, number] => {
  const a = (2 * Math.PI * k) / n;
  return [C + value * PX * Math.sin(a), C - value * PX * Math.cos(a)];
};
const ringOf = (values: number[]) =>
  values.map((v, k) => toScreen(v, k, values.length));

/** The grid a radar usually has: rings at 2, 4, ... 10 and one spoke per
 *  metric, all straight (a polygon grid). Drawn by hand here; the real one
 *  would be the polar space's axis. */
const grid = () => [
  ...[2, 4, 6, 8, 10].map((v) =>
    polygon({
      points: ringOf(metrics.map(() => v)),
      fill: "none",
      stroke: "#d0d4d9",
      strokeWidth: 1,
    })
  ),
  ...metrics.map((_, k) =>
    polygon({
      points: [[C, C], toScreen(10, k, metrics.length), [C, C]],
      fill: "none",
      stroke: "#d0d4d9",
      strokeWidth: 1,
    })
  ),
];
const dots = (values: number[], fill: string) =>
  ringOf(values).map(([x, y]) =>
    polygon({
      points: Array.from({ length: 12 }, (_, i) => {
        const t = (2 * Math.PI * i) / 12;
        return [x + 4 * Math.cos(t), y + 4 * Math.sin(t)] as [number, number];
      }),
      fill,
    })
  );
// A frame so every story has the same W x W box, origin at the top left.
const frame = () =>
  polygon({
    points: [
      [0, 0],
      [W, 0],
      [W, W],
      [0, W],
    ],
    fill: "none",
  });

// PROPOSED (not implemented), one of:
//   chart(selectAll("pts")).mark(line({ curve: Curve.linear({ closed: true }) }))
//   chart(selectAll("pts")).mark(line({ closed: true }))
// The closed curve kind is d3's `curveLinearClosed`: one more segment, from
// the last point to the first. No fill: a line is never filled.
export const ClosedLinePrototype: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      frame(),
      ...grid(),
      // Stand-in for the closed line: a polygon with no fill is the same
      // stroke as a closed linear path.
      polygon({
        points: ringOf(A),
        fill: "none",
        stroke: INK,
        strokeWidth: 2,
      }),
      ...dots(A, INK),
    ]).render(container);
    return container;
  },
};

// PROPOSED (not implemented):
//   chart(selectAll("pts")).mark(polygon({ fill: INK, opacity: 0.25, stroke: INK }))
// `polygon` in a connector (bag) form, taking its vertices from the centers
// of the selected marks, in order, as `line` and `enclose` already do.
// A polygon is always a closed ring, so closing needs no new word, and it
// already has fill, stroke and opacity.
export const PolygonFromRefsPrototype: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      frame(),
      ...grid(),
      polygon({
        points: ringOf(A),
        fill: INK,
        opacity: 0.25,
      }),
      polygon({
        points: ringOf(A),
        fill: "none",
        stroke: INK,
        strokeWidth: 2,
      }),
      ...dots(A, INK),
    ]).render(container);
    return container;
  },
};

// PROPOSED (not implemented), the best form for two series: the points in
// the polar space grouped by series, the outline one polygon per group in a
// layer outside it.
//   layer([
//     chart(both, { coord: Coord.clock() })
//       .flow(
//         spread({ by: "metric", dir: "x", spacing: Spacing.pitch(fr(1)) }),
//         scatter({ by: "series", y: "value" })
//       )
//       .mark(circle({ r: 4, fill: "series" }).name("pts")),
//     chart(selectAll("pts"))
//       .flow(group({ by: "series" }))
//       .mark(polygon({ fill: "series", opacity: 0.25, stroke: "series" })),
//   ])
export const TwoSeriesPrototype: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const series: [number[], string][] = [
      [A, INK],
      [B, RED],
    ];
    layer([
      frame(),
      ...grid(),
      ...series.flatMap(([vs, color]) => [
        polygon({ points: ringOf(vs), fill: color, opacity: 0.2 }),
        polygon({
          points: ringOf(vs),
          fill: "none",
          stroke: color,
          strokeWidth: 2,
        }),
      ]),
      ...series.flatMap(([vs, color]) => dots(vs, color)),
    ]).render(container);
    return container;
  },
};
