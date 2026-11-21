/**
 * PROTOTYPE(#1395): tooltips at the chart's edges. The tallest bar has no
 * room above it, the last bar none on its right. Two tooltips are open at
 * once here only to show both cases in one picture.
 *
 *  - `Naive`: every box goes on top, centered, and is NOT ink: the canvas
 *    grows to hold it and the plot moves down (compare `Closed`).
 *  - `InkOnly`: the same boxes as ink: the plot no longer moves, but the
 *    boxes hang past the plot (and the canvas still grows to hold them,
 *    since the render gives no size).
 *  - `Flipped`: ink, and a side chosen per bar FROM ITS DATUM (tall → right
 *    of the bar, flush with its top; last → flush with its right edge). The
 *    choice is the caller's arithmetic, not a geometric keep-inside rule;
 *    see NOTES.md.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, spread, rect, selectAll, filter, group } from "../../../src/lib";
import { seafood } from "../../../src/data/catch";
import { rowTooltip, beside, type Side } from "./helpers";

const meta: Meta = { title: "Proposals/Tooltips/Edge Cases" };
export default meta;

const LAKES = [...new Set(seafood.map((d) => d.lake))];
const totals = LAKES.map((lake) => {
  const rows = seafood.filter((d) => d.lake === lake);
  const top = [...rows].sort((a, b) => b.count - a.count)[0];
  return {
    lake,
    total: rows.reduce((t, d) => t + d.count, 0),
    species: rows.length,
    largest: top.species,
  };
});
const MAX = Math.max(...totals.map((d) => d.total));
const LAST = LAKES[LAKES.length - 1];

type Placement = { side?: Side; align?: "start" | "middle" | "end"; ink?: boolean };

function edgeChart(focused: string[], place: (row: (typeof totals)[number]) => Placement) {
  return chart(totals, { w: 420, h: 300 })
    .flow(spread({ by: "lake", dir: "x", spacing: 8 }))
    .mark(rect({ h: "total", fill: "#4c78a8" }).name("bars"))
    .layer(
      chart(selectAll("bars"))
        .flow(filter((b: any) => focused.includes(b.datum[0].lake)), group({ by: "lake" }))
        .mark(((b: any[]) => beside(b[0], rowTooltip(b[0].datum[0]), place(b[0].datum[0]))) as any)
    );
}

const OPEN = ["Lake B", LAST];

export const Closed: StoryObj = {
  render: () => {
    const container = initializeContainer();
    edgeChart([], () => ({})).render(container);
    return container;
  },
};

export const Naive: StoryObj = {
  render: () => {
    const container = initializeContainer();
    edgeChart(OPEN, () => ({ side: "top", ink: false })).render(container);
    return container;
  },
};

export const InkOnly: StoryObj = {
  render: () => {
    const container = initializeContainer();
    edgeChart(OPEN, () => ({ side: "top" })).render(container);
    return container;
  },
};

/* The first two again, on a canvas of a fixed size (the render gives w and
 * h): "does an open tooltip move the plot" when the canvas cannot grow. */
const CANVAS = { w: 480, h: 360 };

export const ClosedFixedCanvas: StoryObj = {
  render: () => {
    const container = initializeContainer();
    edgeChart([], () => ({})).render(container, CANVAS);
    return container;
  },
};

export const NaiveFixedCanvas: StoryObj = {
  render: () => {
    const container = initializeContainer();
    edgeChart(OPEN, () => ({ side: "top", ink: false })).render(container, CANVAS);
    return container;
  },
};

export const InkOnlyFixedCanvas: StoryObj = {
  render: () => {
    const container = initializeContainer();
    edgeChart(OPEN, () => ({ side: "top" })).render(container, CANVAS);
    return container;
  },
};

export const Flipped: StoryObj = {
  render: () => {
    const container = initializeContainer();
    edgeChart(OPEN, (d) =>
      d.total > 0.7 * MAX
        ? { side: "right", align: "end", gap: 6 } // no room above: beside, flush with its top
        : d.lake === LAST
          ? { side: "top", align: "end" } // no room on the right: flush with its right edge
          : { side: "top" }
    ).render(container);
    return container;
  },
};
