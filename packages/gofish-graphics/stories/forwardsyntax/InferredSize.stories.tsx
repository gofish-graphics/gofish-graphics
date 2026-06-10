import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood, catchLocationsArray } from "../../src/data/catch";
import { Chart, spread, scatter, circle, rect, layer } from "../../src/lib";

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

// Data-driven SIZE height (bar heights = value) with omitted h → the bars claim
// the canvas, so the extent stays at the 400px default; bars scale to fill it.
export const DataDrivenSizeDefault: StoryObj = {
  render: () => {
    const container = initializeContainer();
    Chart(seafood, { axes: true })
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
    Chart(catchLocationsArray, { axes: true })
      .flow(scatter({ by: "lake", x: "x", y: "y" }))
      .mark(circle({ r: 5 }))
      .render(container, {});
    return container;
  },
};

// Color legend placement off the COMPUTED extent: omitted w/h + a color scale.
// The legend swatches should sit just right of the computed content width.
export const LegendOffComputedExtent: StoryObj = {
  render: () => {
    const container = initializeContainer();
    Chart(seafood)
      .flow(spread({ by: "lake", dir: "x" }))
      .mark(rect({ h: "count", fill: "species" }))
      .render(container, {});
    return container;
  },
};
