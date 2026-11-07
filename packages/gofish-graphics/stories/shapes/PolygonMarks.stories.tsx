import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, polygon, stack, Color, Coord } from "../../src/lib";
import { seafood } from "../../src/data/catch";

const meta: Meta = {
  title: "Shapes/Polygon Marks",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 800, step: 10 } },
    h: { control: { type: "number", min: 100, max: 800, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

// A field name as `fill` goes through the chart's color scale, as it does on
// `rect` (#953). The two triangles take the two ends of the gradient, and the
// stroke follows the fill rather than painting the field name as a color.
export const DataDrivenFill: StoryObj<Args> = {
  args: { w: 200, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    const rows = [
      {
        n: 1,
        ring: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      },
      {
        n: 5,
        ring: [
          [2, 0],
          [3, 0],
          [3, 1],
        ],
      },
    ];
    chart(rows, {
      color: Color.gradient(["#fff5eb", "#7f2704"]),
      axes: false,
      w: args.w,
      h: args.h,
    })
      .mark(polygon({ points: "ring", fill: "n" }))
      .render(container);
    return container;
  },
};

// One petal in its slot's unit box: across the slot on x, out from the
// center on y (the Flower Chart's petal).
const PETAL = "M0 0 L0 .468 Q.451 .809 .5 1 Q.549 .809 1 .468 L1 0 Z";

// A polygon's `d` is drawn in its slot's box, and the polar coord bends
// every point of its outline, curves included. Lake F's green slot spans 192
// degrees, the widest of the Flower Chart's heads.
export const PetalWideSlot: StoryObj<Args> = {
  args: { w: 220, h: 220 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(
      seafood.filter((d) => d.lake === "Lake F"),
      { coord: Coord.polar(), axes: false, w: args.w, h: args.h }
    )
      .flow(stack({ by: "species", dir: "x", h: 90 }))
      .mark(polygon({ w: "count", d: PETAL, fill: "species" }))
      .render(container);
    return container;
  },
};

// Under a donut clock the slot starts at the hole, and so do the petals.
export const PetalDonut: StoryObj<Args> = {
  args: { w: 220, h: 220 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(
      seafood.filter((d) => d.lake === "Lake A"),
      {
        coord: Coord.clock({ innerRadius: 0.4 }),
        axes: false,
        w: args.w,
        h: args.h,
      }
    )
      .flow(stack({ by: "species", dir: "x", h: 90 }))
      .mark(polygon({ w: "count", d: PETAL, fill: "species" }))
      .render(container);
    return container;
  },
};

// A box outline in a polar slot draws a pie slice: its top edge is an arc.
export const PieSlice: StoryObj<Args> = {
  args: { w: 220, h: 220 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(
      seafood.filter((d) => d.lake === "Lake A"),
      { coord: Coord.polar(), axes: false, w: args.w, h: args.h }
    )
      .flow(stack({ by: "species", dir: "x", h: 90 }))
      .mark(
        polygon({ w: "count", d: "M0 0 L0 1 L1 1 L1 0 Z", fill: "species" })
      )
      .render(container);
    return container;
  },
};

// With no coord the same petal fills a bar's box. The unit box's y runs the
// way the canvas does, so the petals point down (#1038).
export const PetalBars: StoryObj<Args> = {
  args: { w: 300, h: 120 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(
      seafood.filter((d) => d.lake === "Lake A"),
      { axes: false, w: args.w, h: args.h }
    )
      .flow(stack({ by: "species", dir: "x", h: 100 }))
      .mark(polygon({ w: "count", d: PETAL, fill: "species" }))
      .render(container);
    return container;
  },
};
