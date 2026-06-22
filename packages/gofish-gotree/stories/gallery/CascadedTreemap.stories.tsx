import type { Meta, StoryObj } from "@storybook/html";
import { rect } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — CascadedTreemap.
// dsl (SliceLayout): mode top-down, node=rectangle, link=none, color=depth.
//   X.Root include (pad 0.02) / X.Subtree flatten (margin 0.19)
//   Y.Root include (pad 0.04) / Y.Subtree align
//   SubtreeWidth=value, SubtreeHeight=adaptive.
// Mapped (include→nest, flatten→distribute, align→align):
//   parentChild = combine({ x: nest, y: nest })   — children inset within parent
//   sibling     = combine({ x: distribute, y: align(middle) })
// A cascaded treemap: every parent rect wraps its children with a small
// asymmetric pad, so each level adds a nested inset border (the "cascade").
// nest on BOTH axes ⇒ internal nodes are UNSIZED on both axes (the parent box
// grows to enclose its subtree); only LEAVES carry intrinsic size — width ∝
// datum value (SubtreeWidth=value), height fixed (SubtreeHeight=adaptive).
const meta: Meta = { title: "GoTree / Gallery / CascadedTreemap" };
export default meta;

const node = (d: any) =>
  d.height === 0
    ? rect({
        w: 22 + d.data.value * 10,
        h: 300,
        fill: byDepth()(d),
        stroke: "#08306b",
        strokeWidth: 1,
      })
    : rect({ fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 });

export const CascadedTreemap: StoryObj = {
  render: () =>
    mount({
      node,
      link: "none",
      // nest on both axes → parent rect encloses its subtree with a small pad.
      // Asymmetric pad (smaller x, larger y) makes the nested insets visible.
      parentChild: combine({
        x: { kind: "nest", pad: 5 },
        y: { kind: "nest", pad: 12 },
      }),
      // siblings spread horizontally (distribute x) sharing a vertical center
      // (align y middle).
      sibling: combine({
        x: { kind: "distribute", spacing: 8 },
        y: { kind: "align", alignment: "middle" },
      }),
    }),
};
