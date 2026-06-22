import type { Meta, StoryObj } from "@storybook/html";
import { rect } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — NestedPieTree (CARTESIAN nested-rectangle form).
//
// The original gallery entry is a POLAR nested-pie (DiceLayout/SliceLayout under
// a polar coordinate system); that radial version is covered separately by the
// `NestedPietree` story in Tree.stories.tsx. This port targets the cartesian
// DiceLayout (dsl2.json) — a nested-rectangle treemap where every parent
// rectangle CONTAINS its children on both axes.
//
// dsl (DiceLayout): mode top-down, cartesian.
//   X.Root  = include (pad 0.04)   X.Subtree = align
//   Y.Root  = include (pad 0.04)   Y.Subtree = flatten (margin 0.15)
// Root relations drive parentChild, Subtree relations drive sibling:
//   parentChild = combine({ x: nest, y: nest })  → parent box wraps its subtree
//                 on BOTH axes (include → nest).
//   sibling     = combine({ x: align, y: distribute })  → siblings stack on y
//                 (flatten → distribute) and share an x-center (align → align
//                 middle).
// nest on both axes ⇒ internal/parent rects are UNSIZED on both axes (they grow
// to wrap their subtree); leaves carry the size, driven by the datum value
// (DiceLayout: SubtreeHeight = value). Color by depth.
const meta: Meta = { title: "GoTree / Gallery / NestedPieTree" };
export default meta;

// rectangle nodes, colored by depth. Leaves are sized by their datum value
// (height ∝ value, fixed width); internal nodes are left UNSIZED on both axes
// (the nest axes) so each parent box grows to enclose its whole subtree.
const node = (d: any) =>
  d.height === 0
    ? rect({
        w: 40,
        h: (d.data.value ?? d.width ?? 1) * 16,
        fill: byDepth()(d),
      })
    : rect({ fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 });

export const NestedPieTree: StoryObj = {
  render: () =>
    mount({
      node,
      link: "none",
      // include → nest on both axes: the parent rectangle wraps its subtree
      // group horizontally and vertically with a small padding.
      parentChild: combine({
        x: { kind: "nest", pad: 6 },
        y: { kind: "nest", pad: 6 },
      }),
      // align → align(middle) on x; flatten → distribute on y (siblings
      // stacked vertically, sharing an x-center).
      sibling: combine({
        x: { kind: "align", alignment: "middle" },
        y: { kind: "distribute", spacing: 8 },
      }),
    }),
};
