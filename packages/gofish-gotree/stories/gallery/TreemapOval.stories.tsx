import type { Meta, StoryObj } from "@storybook/html";
import { ellipse } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — TreemapOval.
// dsl: bottom-up, node=ellipse, link=none, color=depth.
//   X: Root include / Subtree flatten ; Y: Root include / Subtree align.
//   (DiceOval/SliceOval alternate per depth; we use one unified nested form.)
//   parentChild = (nest x, nest y)        sibling = (distribute x, align y)
// A treemap with ELLIPSE nodes instead of rectangles: nested ovals. Both axes
// nest so each parent oval grows to wrap its subtree's bounding box; siblings
// spread horizontally and share a y-center. Leaves are sized by their datum
// value. Because nest sizes a bounding BOX, an ellipse wrapping children
// overflows visually at its corners — expected for oval treemaps.
const meta: Meta = { title: "GoTree / Gallery / TreemapOval" };
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

export const TreemapOval: StoryObj = {
  render: () =>
    mount({
      node,
      link: "none",
      parentChild: combine({
        x: { kind: "nest", pad: 10 },
        y: { kind: "nest", pad: 10 },
      }),
      sibling: combine({
        x: { kind: "distribute", spacing: 8 },
        y: { kind: "align", alignment: "middle" },
      }),
    }),
};
