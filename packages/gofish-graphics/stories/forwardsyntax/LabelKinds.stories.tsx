import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood, catchLocationsArray } from "../../src/data/catch";
import { streamgraphData } from "../../src/data/streamgraphData";
import {
  Chart,
  spread,
  stack,
  layer,
  select,
  rect,
  circle,
  line,
  area,
  blank,
  group,
  scatter,
} from "../../src/lib";

const meta: Meta = {
  title: "Forward Syntax V3/Label Kinds (Prototype)",
  argTypes: {
    w: { control: { type: "number", min: 200, max: 1000, step: 10 } },
    h: { control: { type: "number", min: 200, max: 1000, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

// ─── box ──────────────────────────────────────────────────────────────────────
// Regression: bars with `.label("count")`. Falls through to the existing
// declarative behavior — no obstacle-aware placement.

export const Box: StoryObj<Args> = {
  name: "box: bar chart (regression)",
  args: { w: 500, h: 300 },
  render: (args) => {
    const container = initializeContainer();
    Chart(seafood)
      .flow(spread({ by: "lake", dir: "x" }))
      .mark(rect({ h: "count" }).label("count"))
      .render(container, { w: args.w, h: args.h, axes: true });
    return container;
  },
};

// ─── point ────────────────────────────────────────────────────────────────────
// Connected scatterplot: circles labeled with lake name. Vega-label compass-8
// placement should keep labels off both other points AND the connecting line
// segments (path-avoidance falls out of the obstacle gatherer emitting per-
// segment AABBs for the connect node).

export const Point: StoryObj<Args> = {
  name: "point: connected scatterplot with path avoidance",
  args: { w: 600, h: 400 },
  render: (args) => {
    const container = initializeContainer();
    layer([
      Chart(catchLocationsArray)
        .flow(scatter({ by: "lake", x: "x", y: "y" }))
        .mark(circle({ r: 8 }).name("points").label("lake")),
      Chart(select("points")).mark(line({ stroke: "#999", strokeWidth: 1 })),
    ]).render(container, { w: args.w, h: args.h, axes: true });
    return container;
  },
};

// ─── path ─────────────────────────────────────────────────────────────────────
// Line chart with text drawn along the curve via SVG <textPath>.

export const Path: StoryObj<Args> = {
  name: "path: text along the curve",
  args: { w: 600, h: 400 },
  render: (args) => {
    const container = initializeContainer();
    layer([
      Chart(catchLocationsArray)
        .flow(scatter({ by: "lake", x: "x", y: "y" }))
        .mark(blank().name("points")),
      Chart(select("points")).mark(
        line({ stroke: "#4f46e5", strokeWidth: 2 }).label(
          () => "the trip across all lakes",
          { fontSize: 14 }
        )
      ),
    ]).render(container, { w: args.w, h: args.h, axes: true });
    return container;
  },
};

// ─── area ─────────────────────────────────────────────────────────────────────
// Single filled area, labeled at its polylabel (pole of inaccessibility).

export const Area: StoryObj<Args> = {
  name: "area: polylabel placement",
  args: { w: 600, h: 400 },
  render: (args) => {
    const seriesZero = streamgraphData.filter((d) => d.c === 0);
    const container = initializeContainer();
    layer([
      Chart(seriesZero)
        .flow(spread({ by: "x", dir: "x", spacing: 50 }))
        .mark(blank({ h: "y" }).name("pts")),
      Chart(select("pts")).mark(
        area({ opacity: 0.7 }).label(() => "series 0", { fontSize: 18 })
      ),
    ]).render(container, { w: args.w, h: args.h, axes: true });
    return container;
  },
};

// ─── ribbon ───────────────────────────────────────────────────────────────────
// Stacked area, one label per ribbon via d3-area-label.

export const Ribbon: StoryObj<Args> = {
  name: "ribbon: d3-area-label per stack",
  args: { w: 600, h: 400 },
  render: (args) => {
    const container = initializeContainer();
    layer([
      Chart(streamgraphData)
        .flow(
          group({ by: "c" }),
          spread({ by: "x", dir: "x", spacing: 50 }),
          stack({ by: "c", dir: "y" })
        )
        .mark(blank({ h: "y", fill: "c" }).name("bars")),
      Chart(select("bars"))
        .flow(group({ by: "c" }))
        .mark(area({ opacity: 0.8 }).label("c", { kind: "ribbon" })),
    ]).render(container, { w: args.w, h: args.h, axes: true });
    return container;
  },
};

// ─── override ─────────────────────────────────────────────────────────────────
// Same data rendered three times with the same `area` mark, but the per-call
// `.label("...", { kind })` overrides the default strategy. Demonstrates that
// `kind` is data-independent — it's a placement choice.

export const Override: StoryObj<Args> = {
  name: "override: area / ribbon / path on the same shape",
  args: { w: 900, h: 320 },
  render: (args) => {
    const container = initializeContainer();
    const seriesZero = streamgraphData.filter((d) => d.c === 0);
    const w = Math.floor(args.w / 3);
    for (const kind of ["area", "ribbon", "path"] as const) {
      const cell = document.createElement("div");
      cell.style.display = "inline-block";
      cell.style.verticalAlign = "top";
      cell.style.padding = "4px";
      const title = document.createElement("div");
      title.textContent = `kind: "${kind}"`;
      title.style.font = "12px monospace";
      title.style.padding = "4px 0";
      cell.appendChild(title);
      const inner = document.createElement("div");
      cell.appendChild(inner);
      container.appendChild(cell);
      layer([
        Chart(seriesZero)
          .flow(spread({ by: "x", dir: "x", spacing: 24 }))
          .mark(blank({ h: "y" }).name("pts")),
        Chart(select("pts")).mark(
          area({ opacity: 0.7 }).label(() => "series 0", {
            kind,
            fontSize: 14,
          })
        ),
      ]).render(inner, { w, h: args.h - 30, axes: false });
    }
    return container;
  },
};
