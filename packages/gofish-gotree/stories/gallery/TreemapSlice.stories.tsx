import type { Meta, StoryObj } from "@storybook/html";
import { rect } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — treemap-slice (slice-and-dice treemap).
// dsl: X.Root include (pad ~0.02) / X.Subtree flatten (margin 0.26);
//      Y.Root include (pad ~0.09) / Y.Subtree align (middle). Mode top-down.
//   parentChild = combine({ x: nest, y: nest })  → parent box contains its
//     subtree on BOTH axes (so every level is a slice within its parent).
//   sibling     = combine({ x: distribute, y: align middle }) → siblings are
//     sliced side by side along x and centered vertically.
// SubtreeWidth = value, SubtreeHeight = adaptive: leaves are sized in x by
// their datum value and given a fixed height; internal nodes are UNSIZED on
// both axes (the nest constraint grows each parent box to wrap its subtree).
// include → nest, flatten → distribute, align(middle) → align(middle).

// Blue depth ramp matching the gotree ColorRange (dark root → light leaves).
const slices = [
  "#2171b5",
  "#4292c6",
  "#6baed6",
  "#9ecae1",
  "#c6dbef",
  "#deebf7",
];

const LEAF_HEIGHT = 320; // adaptive height → fixed pixel height per leaf
const VALUE_SCALE = 30; // leaf width = datum value * scale (slice by value)

// rectangle nodes, colored by depth, white slice borders. Leaves are sized by
// data (width = value, fixed height); internal/parent rects are left UNSIZED on
// both axes so each nest grows the box to wrap its sliced subtree.
const node = (d: any) =>
  d.height === 0
    ? rect({
        w: (d.data.value ?? d.width) * VALUE_SCALE,
        h: LEAF_HEIGHT,
        fill: byDepth(slices)(d),
        stroke: "white",
        strokeWidth: 4,
      })
    : rect({ fill: byDepth(slices)(d), stroke: "white", strokeWidth: 4 });

export const TreemapSlice: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: "none",
        parentChild: combine({
          x: { kind: "nest", pad: 6 },
          y: { kind: "nest", pad: 22 },
        }),
        sibling: combine({
          x: { kind: "distribute", spacing: 14 },
          y: { kind: "align", alignment: "middle" },
        }),
      },
      { w: 900, h: 360 }
    ),
};

const meta: Meta = {
  title: "GoTree / Gallery / treemap-slice",
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Slice Treemap",
      description:
        "A slice-and-dice treemap subdividing each parent rectangle into value-proportional child slices.",
    },
  },
};
export default meta;
