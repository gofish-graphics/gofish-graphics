import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood, catchLocationsArray } from "../../src/data/catch";
import { chart, spread, scatter, circle, rect, layer } from "../../src/lib";

// Exercises issue #494: when the user omits `w`/`h` on `.render(...)`, the
// overall size is computed during layout rather than propagating NaN. Each
// story omits both dimensions; the caption notes the expected computed extent.
const meta: Meta = {
  title: "Forward Syntax V3/Inferred Size",
};
export default meta;

// A bare fixed-size shape: it ignores the canvas and reports its own bbox, so
// the laid-out extent (read back from `child.dims`) shrinks the SVG to fit
// ~80x50 (+ padding), NOT the 400px default.
export const BareShapeShrinkToFit: StoryObj = {
  render: () => {
    const container = initializeContainer();
    rect({ w: 80, h: 50, fill: "steelblue" }).render(container, {});
    return container;
  },
};

// A `layer` of fixed-size, positioned shapes reports the union of child bboxes,
// so the SVG shrinks to that content extent rather than the default.
export const LayerShrinkToFit: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      rect({ x: 0, y: 0, w: 90, h: 40, fill: "steelblue" }),
      rect({ x: 30, y: 50, w: 90, h: 40, fill: "tomato" }),
    ]).render(container, {});
    return container;
  },
};

// Per-axis inference on a bar chart with both dims omitted. The y axis is a
// data-driven SIZE (bar heights = value), so it needs a canvas and falls back to
// the 400px default — bars scale to fill it. The x axis is ORDINAL (categories),
// which has nothing to scale, so bars keep their default 16px width and the chart
// shrinks-to-fit horizontally.
export const DataDrivenHeightDefault: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(seafood, { axes: true })
      .flow(spread({ by: "lake", dir: "x" }))
      .mark(rect({ h: "count" }))
      .render(container, {});
    return container;
  },
};

// POSITION space (scatter) with omitted w/h → 400x400 default.
export const PositionScatterDefault: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(catchLocationsArray, { axes: true })
      .flow(scatter({ by: "lake", x: "x", y: "y" }))
      .mark(circle({ r: 5 }))
      .render(container, {});
    return container;
  },
};

// With w/h omitted and a color scale present, the legend should be positioned
// relative to the COMPUTED content extent: its swatches sit just right of the
// computed content width, not off an assumed/default width.
export const LegendTracksComputedExtent: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(seafood)
      .flow(spread({ by: "lake", dir: "x" }))
      .mark(rect({ h: "count", fill: "species" }))
      .render(container, {});
    return container;
  },
};
