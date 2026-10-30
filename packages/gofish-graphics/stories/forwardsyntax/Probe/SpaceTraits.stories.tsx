import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  spread,
  stack,
  rect,
  field,
  Unit,
  Coord,
  treemap,
} from "../../../src/lib";

// Throwaway probes for the space-traits design investigation. Not for commit.
const meta: Meta = { title: "Probe/SpaceTraits" };
export default meta;

type Args = { w: number; h: number };

const run = (f: (c: HTMLElement) => unknown) => () => {
  const container = initializeContainer();
  try {
    const p = f(container) as any;
    if (p && typeof p.catch === "function")
      p.catch((e: Error) => {
        const pre = document.createElement("pre");
        pre.textContent = "ERROR: " + e.message;
        container.appendChild(pre);
      });
  } catch (e) {
    const pre = document.createElement("pre");
    pre.textContent = "ERROR: " + (e as Error).message;
    container.appendChild(pre);
  }
  return container;
};

// #992: stack(stack(30, -25), 10). The 10 should start at the net 5.
export const NestedSignedStack: StoryObj<Args> = {
  render: run((c) =>
    chart(
      [
        { g: "a", s: "p", v: 30 },
        { g: "a", s: "q", v: -25 },
        { g: "b", s: "p", v: 10 },
      ],
      { w: 200, h: 300, axes: true }
    )
      .flow(stack({ by: "g", dir: "y" }), stack({ by: "s", dir: "y" }))
      .mark(rect({ w: 40, h: "v", fill: "g", stroke: "black" }))
      .render(c)
  ),
};

// A mosaic spelled with no `size` option: every part of a column has the
// same width, so the cross-axis union of the column agrees on one vector.
const mosaicRows = [
  { origin: "Europe", cylinders: "4", count: 66 },
  { origin: "Europe", cylinders: "5", count: 3 },
  { origin: "Europe", cylinders: "6", count: 4 },
  { origin: "Japan", cylinders: "3", count: 4 },
  { origin: "Japan", cylinders: "4", count: 69 },
  { origin: "Japan", cylinders: "6", count: 6 },
  { origin: "USA", cylinders: "4", count: 72 },
  { origin: "USA", cylinders: "6", count: 74 },
  { origin: "USA", cylinders: "8", count: 108 },
];
const totals: Record<string, number> = {};
for (const r of mosaicRows)
  totals[r.origin] = (totals[r.origin] ?? 0) + r.count;
const mosaicData = mosaicRows.map((r) => ({
  ...r,
  total: totals[r.origin],
  share: r.count / totals[r.origin],
}));
export const MosaicUniformWidths: StoryObj<Args> = {
  render: run((c) =>
    chart(mosaicData, { w: 400, h: 300, axes: true })
      .flow(
        stack({ by: "origin", dir: "x" }),
        stack({ by: "cylinders", dir: "y" })
      )
      .mark(rect({ w: "total", h: "share", fill: "origin", stroke: "white" }))
      .render(c)
  ),
};

// A grouped column (spread) inside a stack: the cross-axis union is a max,
// not a vector. The swapped Likert, transposed.
const sales = [
  { year: "2024", region: "N", v: 10 },
  { year: "2024", region: "S", v: 40 },
  { year: "2025", region: "N", v: 30 },
  { year: "2025", region: "S", v: 5 },
];
export const StackOfGroupedBars: StoryObj<Args> = {
  render: run((c) =>
    chart(sales, { w: 300, h: 300, axes: true })
      .flow(stack({ by: "year", dir: "y" }), spread({ by: "region", dir: "x" }))
      .mark(rect({ h: "v", fill: "year" }))
      .render(c)
  ),
};

// Temperatures: a unit with no CanAdd.
const temps = [
  { city: "Oslo", month: "Jan", t: -4 },
  { city: "Oslo", month: "Jul", t: 17 },
  { city: "Rome", month: "Jan", t: 8 },
  { city: "Rome", month: "Jul", t: 25 },
];
const degC = Unit("degC");
export const TemperatureBars: StoryObj<Args> = {
  render: run((c) =>
    chart(temps, { w: 300, h: 250, axes: true, schema: { t: degC } })
      .flow(spread({ by: "city", dir: "x" }))
      .mark(rect({ h: field("t").mean(), fill: "city" }))
      .render(c)
  ),
};
export const TemperatureStack: StoryObj<Args> = {
  render: run((c) =>
    chart(temps, { w: 300, h: 250, axes: true, schema: { t: degC } })
      .flow(spread({ by: "city", dir: "x" }), stack({ by: "month", dir: "y" }))
      .mark(rect({ h: "t", fill: "month" }))
      .render(c)
  ),
};

// A bar whose length is an instant: no zero.
const launches = [
  { name: "A", when: new Date("2024-03-01") },
  { name: "B", when: new Date("2024-09-15") },
];
export const DateBar: StoryObj<Args> = {
  render: run((c) =>
    chart(launches, { w: 400, h: 200, axes: true })
      .flow(spread({ by: "name", dir: "y" }))
      .mark(rect({ w: "when", fill: "name" }))
      .render(c)
  ),
};

// Gantt: each bar is an instant plus a duration.
const DAY = 864e5;
const t0 = Date.UTC(2024, 0, 1);
const tasks = [
  { task: "Research", start: new Date(t0), days: 5 },
  { task: "Design", start: new Date(t0 + 4 * DAY), days: 7 },
  { task: "Build", start: new Date(t0 + 10 * DAY), days: 12 },
].map((d) => ({ ...d, dur: d.days * DAY }));
export const Gantt: StoryObj<Args> = {
  render: run((c) =>
    chart(tasks, { w: 500, h: 200, axes: true })
      .flow(spread({ by: "task", dir: "y" }))
      .mark(rect({ x: "start", w: "dur", fill: "task" }))
      .render(c)
  ),
};

// A Gantt bar whose width is an instant (instant + instant): should be a
// unit error, since only a duration acts on an instant.
const tasksWithEnd = tasks.map((d) => ({
  ...d,
  end: new Date(d.start.getTime() + d.dur),
}));
export const GanttInstantWidth: StoryObj<Args> = {
  render: run((c) =>
    chart(tasksWithEnd, { w: 500, h: 200, axes: true })
      .flow(spread({ by: "task", dir: "y" }))
      .mark(rect({ x: "start", w: field("end").mean(), fill: "task" }))
      .render(c)
  ),
};

// Radial bars and a pie (a stack along the cyclic angle).
const fish = [
  { species: "Bass", count: 30 },
  { species: "Trout", count: 50 },
  { species: "Pike", count: 20 },
];
export const RadialBars: StoryObj<Args> = {
  render: run((c) =>
    chart(fish, { w: 300, h: 300, axes: true, coord: Coord.clock() })
      .flow(spread({ by: "species", dir: "x", spacing: 0 }))
      .mark(rect({ h: "count", fill: "species" }))
      .render(c)
  ),
};
// A pie whose angle is a stack of mean temperatures: no CanAdd, so no whole.
export const PieOfTemperatures: StoryObj<Args> = {
  render: run((c) =>
    chart(temps, { w: 300, h: 300, coord: Coord.clock(), schema: { t: degC } })
      .flow(stack({ by: "city", dir: "x" }))
      .mark(rect({ w: field("t").mean(), fill: "city" }))
      .render(c)
  ),
};

// Treemap sizes are nonnegative magnitudes. One is negative here.
export const TreemapNegative: StoryObj<Args> = {
  render: run((c) =>
    chart(
      [
        { k: "a", v: 40 },
        { k: "b", v: 30 },
        { k: "c", v: -20 },
      ],
      { w: 300, h: 300 }
    )
      .flow(treemap({ by: "k", size: "v" } as any))
      .mark(rect({ fill: "k", stroke: "white" }))
      .render(c)
  ),
};

// #507: a stack of fixed-size children. No part has a vector.
export const FixedSizeStack: StoryObj<Args> = {
  render: run((c) =>
    chart(fish, { axes: true })
      .flow(stack({ by: "species", dir: "y" }))
      .mark(rect({ w: 40, h: 20, fill: "species" }))
      .render(c)
  ),
};

// Rendering bugs. A valid stack (every part agrees on its height, so every
// part has a vector) whose parts are x-spreads, each with an ordinal x axis.
const rows = [
  { row: "r1", col: "a", h: 10 },
  { row: "r1", col: "b", h: 10 },
  { row: "r1", col: "c", h: 10 },
  { row: "r2", col: "a", h: 20 },
  { row: "r2", col: "b", h: 20 },
  { row: "r2", col: "c", h: 20 },
  { row: "r3", col: "a", h: 15 },
  { row: "r3", col: "b", h: 15 },
  { row: "r3", col: "c", h: 15 },
];
export const StackOfUniformRows: StoryObj<Args> = {
  render: run((c) =>
    chart(rows, { w: 300, h: 300, axes: true })
      .flow(stack({ by: "row", dir: "y" }), spread({ by: "col", dir: "x" }))
      .mark(rect({ h: "h", fill: "row", stroke: "white" }))
      .render(c)
  ),
};
// Same, but row r2 has no "a": its cells should keep their columns.
const rowsMissing = rows.filter((r) => !(r.row === "r2" && r.col === "a"));
export const StackOfUniformRowsMissingKey: StoryObj<Args> = {
  render: run((c) =>
    chart(rowsMissing, { w: 300, h: 300, axes: true })
      .flow(stack({ by: "row", dir: "y" }), spread({ by: "col", dir: "x" }))
      .mark(rect({ h: "h", fill: "row", stroke: "white" }))
      .render(c)
  ),
};
// A stack of mean temperatures: the size channel sums nothing, so only the
// stack's own CanAdd check (#1197) can catch it.
export const TemperatureStackOfMeans: StoryObj<Args> = {
  render: run((c) =>
    chart(temps, { w: 200, h: 250, axes: true, schema: { t: degC } })
      .flow(stack({ by: "city", dir: "y" }))
      .mark(rect({ w: 40, h: field("t").mean(), fill: "city" }))
      .render(c)
  ),
};

// A bar whose length is a mean instant: no sum, so no CanAdd check.
export const DateBarMean: StoryObj<Args> = {
  render: run((c) =>
    chart(launches, { w: 400, h: 200, axes: true })
      .flow(spread({ by: "name", dir: "y" }))
      .mark(rect({ w: field("when").mean(), fill: "name" }))
      .render(c)
  ),
};

// The reference picture: the same rows as a spread of stacks.
export const UniformRowsReference: StoryObj<Args> = {
  render: run((c) =>
    chart(rowsMissing, { w: 300, h: 300, axes: true })
      .flow(spread({ by: "col", dir: "x" }), stack({ by: "row", dir: "y" }))
      .mark(rect({ h: "h", fill: "row", stroke: "white" }))
      .render(c)
  ),
};
