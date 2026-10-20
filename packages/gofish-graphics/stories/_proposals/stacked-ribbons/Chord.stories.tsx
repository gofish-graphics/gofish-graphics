import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  spread,
  stack,
  rect,
  ribbon,
  selectAll,
  group,
  layer,
  field,
  Curve,
  filter,
  project,
} from "../../../src/lib";
import { clock } from "../../../src/ast/coordinateTransforms/clock";
// THROWAWAY prototype (see the file header); not part of the public API.
import { chordRibbon } from "../../../src/ast/graphicalOperators/_proposalChordRibbon";

const meta: Meta = { title: "Proposals/Stacked Ribbons/Chord" };
export default meta;

// Bostock's hair-color chord matrix: matrix[i][j] = flow from i to j.
export const names = ["black", "blonde", "brown", "red"];
export const matrix = [
  [11975, 5871, 8916, 2868],
  [1951, 10048, 2060, 6171],
  [8010, 16145, 8090, 8045],
  [1013, 990, 940, 6907],
];

// Ends rows: group i's arc is split into one sub-arc per j (value
// matrix[i][j]); the chord {i, j} joins sub-arc (i, j) to sub-arc (j, i).
export const chordEnds = names.flatMap((g, i) =>
  names.map((s, j) => ({
    group: g,
    sub: s,
    value: matrix[i][j],
    chord: [Math.min(i, j), Math.max(i, j)].join("-"),
    // d3.chord orders sub-arcs by j; a self chord (i == j) has one end.
    subOrder: j,
    // d3 colors a chord by its larger end.
    color: matrix[i][j] >= matrix[j][i] ? g : s,
  }))
);

const arcs = (spacing: number) =>
  chart(chordEnds)
    .flow(
      spread({ by: field("group").sort(names), dir: "x", spacing, w: 2 * Math.PI, y: 160, h: 16, axes: false }),
      stack({ by: field("subOrder").sort(), dir: "x", axes: false })
    )
    .mark(rect({ w: "value", fill: "group", opacity: 0.35, stroke: "white", strokeWidth: 0.5 }).name("ends"));

// Best attempt with today's API: one ribbon per chord over the two ends.
// Edge mode joins the FACING edges along `dir`: for dir "x" (theta) that is
// the trailing radial edge of one sub-arc and the leading radial edge of the
// other, so the band runs AROUND the ring instead of through the center.
export const TodayDirX: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ coord: clock() }, [
      arcs(0.04),
      chart(selectAll("ends"))
        .flow(group({ by: "chord" }))
        .mark(ribbon({ opacity: 0.6, fill: "color", dir: "x" })),
    ]).render(container, { w: 420, h: 420 });
    return container;
  },
};

// dir "y" (radius): joins the outer edge of the first sub-arc to the inner
// edge of the second. Both ends live on the same ring, so the "facing"
// edges do not face each other.
export const TodayDirY: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ coord: clock() }, [
      arcs(0.04),
      chart(selectAll("ends"))
        .flow(group({ by: "chord" }))
        .mark(ribbon({ opacity: 0.6, fill: "color", dir: "y", curve: Curve.bezier() })),
    ]).render(container, { w: 420, h: 420 });
    return container;
  },
};

// Probe: why does the ring not close? Same arcs, chart-level coord, stack.
export const ProbeRingStack: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(chordEnds, { coord: clock() })
      .flow(
        stack({ by: field("group").sort(names), dir: "x", y: 160, h: 16, axes: false }),
        stack({ by: field("subOrder").sort(), dir: "x", axes: false })
      )
      .mark(rect({ w: "value", fill: "group" }))
      .render(container, { w: 420, h: 420 });
    return container;
  },
};
export const ProbeRingSpread: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(chordEnds, { coord: clock() })
      .flow(
        spread({ by: field("group").sort(names), dir: "x", spacing: 0.04, y: 160, h: 16, axes: false }),
        stack({ by: field("subOrder").sort(), dir: "x", axes: false })
      )
      .mark(rect({ w: "value", fill: "group" }))
      .render(container, { w: 420, h: 420 });
    return container;
  },
};

// Gaps between groups (d3's padAngle): an extra invisible end per group. A
// polar spread with spacing does not fit the full circle (ProbeRingSpread),
// so the gap is a data row inside the stack instead.
const total = matrix.flat().reduce((a, b) => a + b, 0);
const withGaps = [
  ...chordEnds.map((e) => ({ ...e, gap: false })),
  ...names.map((g) => ({
    group: g, sub: "gap", value: total * 0.012, chord: "gap-" + g,
    subOrder: 99, color: g, gap: true,
  })),
];

// THROWAWAY prototype: chordRibbon joins the two ends' inner faces through
// the center (src/ast/graphicalOperators/_proposalChordRibbon.ts).
export const Prototype: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ coord: clock() }, [
      chart(withGaps)
        .flow(
          stack({ by: field("group").sort(names), dir: "x", y: 160, h: 16, axes: false }),
          stack({ by: field("subOrder").sort(), dir: "x", axes: false })
        )
        .mark(rect({ w: "value", h: (d: any) => (d.gap ? 0 : 16), fill: "group" } as any).name("ends")),
      chart(selectAll("ends"))
        .flow(
          filter((r: any) => project(r, "gap") === false),
          group({ by: "chord" })
        )
        .mark(chordRibbon({ fill: "color", opacity: 0.67 } as any)),
    ]).render(container, { w: 420, h: 420 });
    return container;
  },
};
