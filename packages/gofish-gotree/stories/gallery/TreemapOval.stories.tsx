import type { Meta, StoryObj } from "@storybook/html";
import { ellipse } from "gofish-graphics";
import { tree, combine, alternate } from "../../src";
import { byDepth, sampleTree } from "../data";
import { initializeContainer } from "../helper";

// GoTree gallery port — TreemapOval.
// The original alternates two templates by depth (gallery dsl1 ⇄ dsl2):
//   dsl1 DiceOval: X align / Y flatten  → siblings spread on Y, centered on X.
//   dsl2 SliceOval: X flatten / Y align → siblings spread on X, centered on Y.
// Expressed with `alternate([dice, slice])` so the subdivision swaps slice↔dice
// at every level — a rounder, more 2D-filled nesting than a single stretched
// template. Both root relations are `include` → parentChild nests on both axes.
// A treemap with ELLIPSE nodes instead of rectangles: nested ovals. Both axes
// nest so each parent oval grows to wrap its subtree's bounding box. Leaves are
// sized by their datum value. Because nest sizes a bounding BOX, an ellipse
// wrapping children overflows visually at its corners — expected for oval
// treemaps.
const meta: Meta = {
  title: "GoTree / Gallery / TreemapOval",
};
export default meta;

// ellipse nodes, colored by depth. Internal nodes are left UNSIZED on both x
// and y (the nest axes) so each parent oval grows to wrap its subtree; leaves
// are sized by their datum value (area-ish ramp).
const node = (d: any) =>
  d.height === 0
    ? ellipse({
        w: 22 + d.data.value * 14,
        h: 22 + d.data.value * 14,
        fill: byDepth()(d),
      })
    : ellipse({ fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 });

const P = 10;
const G = 8;
// dice: siblings stack vertically (spread y), share an x-center.
const dice = combine({
  x: { kind: "align", alignment: "middle" },
  y: { kind: "distribute", spacing: G },
});
// slice: siblings spread horizontally (spread x), share a y-center.
const slice = combine({
  x: { kind: "distribute", spacing: G },
  y: { kind: "align", alignment: "middle" },
});

export const TreemapOval: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Oval Treemap",
      description:
        "A treemap variant that nests value-sized ellipses, alternating slice and dice subdivision by depth.",
    },
  },
  render: () => {
    const container = initializeContainer({ w: 640, h: 420 });
    tree(
      {
        node,
        link: "none",
        // Both axes nest so each parent oval wraps its subtree's bbox.
        parentChild: combine({
          x: { kind: "nest", pad: P },
          y: { kind: "nest", pad: P },
        }),
        // Subdivision alternates slice↔dice every level (depth-indexed).
        sibling: alternate([slice, dice]),
      },
      sampleTree
    ).render(container, { w: 640, h: 420 });
    return container;
  },
};
