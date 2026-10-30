import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  circle,
  Color,
  layer,
  rect,
  scatter,
  spread,
  stack,
  table,
  time,
} from "../../../src/lib";
import {
  barDraws,
  hopDraws,
  pointDraws,
  salesDraws,
  salesDrawsByDraw,
  tileDraws,
  tileEstimates,
} from "./noise-data";

// Prototypes for #980, "uncertainty as noise" (ggdibbler). Each chart draws
// precomputed draws (see noise-data.ts); GoFish has no Dist type yet.
const meta: Meta = { title: "Proposals/Uncertainty/Noise" };
export default meta;

/** Uncertain bar chart, dodge: 20 draws side by side in each category. */
export const BarDodge: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(barDraws, { w: 480, h: 260 })
      .flow(
        spread({ by: "category", dir: "x", spacing: 12 }),
        spread({ by: "draw", dir: "x", spacing: 0, axes: false })
      )
      .mark(rect({ h: "value", fill: "#4e79a7" }))
      .render(container, { axes: true });
    return container;
  },
};

/** Uncertain stacked bar, dodge: each draw is a full stack by product. */
export const StackedDodge: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(salesDraws, { w: 480, h: 260 })
      .flow(
        spread({ by: "region", dir: "x", spacing: 16 }),
        spread({ by: "draw", dir: "x", spacing: 0, axes: false }),
        stack({ by: "product", dir: "y" })
      )
      .mark(rect({ h: "sales", fill: "product" }))
      .render(container, { axes: true });
    return container;
  },
};

/** Uncertain stacked bar, transparency: all draws overlaid in one slot.
 *  No in-slot overlay operator exists, so this layers one chart per draw. */
export const StackedTransparency: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer(
      salesDrawsByDraw.map((draw) =>
        chart(draw)
          .flow(
            spread({ by: "region", dir: "x", spacing: 16 }),
            stack({ by: "product", dir: "y" })
          )
          .mark(rect({ h: "sales", fill: "product", opacity: 0.1 }))
      )
    ).render(container, { w: 480, h: 260, axes: true });
    return container;
  },
};

/** Uncertain scatter: 30 draws of each point, overlaid at low opacity. */
export const ScatterOverlay: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(pointDraws, { w: 400, h: 320 })
      .flow(scatter({ x: "x", y: "y" }))
      .mark(circle({ r: 3, fill: "group", opacity: 0.3 }))
      .render(container, { axes: true });
    return container;
  },
};

/** HOPs as small multiples: one frame per draw. */
export const HopsStrip: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(hopDraws, { w: 720, h: 160 })
      .flow(
        spread({ by: "draw", dir: "x", spacing: 24 }),
        spread({ by: "category", dir: "x", spacing: 4 })
      )
      .mark(rect({ h: "value", fill: "#4e79a7" }))
      .render(container, { axes: true });
    return container;
  },
};

/** HOPs as a real animation: one frame per draw (held still on draw 0). */
export const Hops: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(hopDraws, { w: 240, h: 160 })
      .flow(
        time.sequence({ by: "draw", duration: 3000, playing: false }),
        spread({ by: "category", dir: "x", spacing: 4 })
      )
      .mark(rect({ h: "value", fill: "#4e79a7" }))
      .render(container, { axes: true });
    return container;
  },
};

const MAP_COLOR = Color.gradient(["#f7fbff", "#6baed6", "#08306b"]);

/** Uncertain map (a): the plain choropleth of the means. */
export const MapMeans: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(tileEstimates, { w: 320, h: 240, color: MAP_COLOR })
      .flow(table({ by: { x: "col", y: "row" }, spacing: 2 }))
      .mark(rect({ fill: "mean" }))
      .render(container, { axes: false });
    return container;
  },
};

/** Uncertain map (b): pixel version, each tile a 4×4 grid of draws. */
export const MapPixel: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(tileDraws, { w: 320, h: 240, color: MAP_COLOR })
      .flow(
        table({ by: { x: "col", y: "row" }, spacing: 2 }),
        table({ by: { x: "sx", y: "sy" }, spacing: 0 })
      )
      .mark(rect({ fill: "value" }))
      .render(container, { axes: false });
    return container;
  },
};

/** Uncertain map (c): transparency version, the draws of each tile overlaid.
 *  No in-slot overlay exists, so the tiles are placed by `scatter` at their
 *  grid position (scatter overlaps by itself) with a fixed pixel size. */
export const MapTransparency: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(tileDraws, { w: 320, h: 240, color: MAP_COLOR })
      .flow(scatter({ x: "col", y: "rowUp" }))
      .mark(rect({ w: 38, h: 38, fill: "value", opacity: 0.15 }))
      .render(container, { axes: false });
    return container;
  },
};
