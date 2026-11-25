import type { Meta, StoryObj } from "@storybook/html";
import { rect, datum, Coord } from "gofish-graphics";
import { combine, byDepth, mount, sampleTree } from "./_shared";

// GoTree gallery port — ViolinTree (one angular slot per node around the
// circle; a parent's radial span covers its children's).
// dsl: bottom-up; X[Subtree flatten / Root juxtapose] Y[Subtree flatten
// (Margin -0.46, space-between) / Root include] under CoordinateSystem polar
// {PolarCenter bottom, StartAngle 0.01}; Node rectangle, Color depth.
//
// Under polar(): x = θ, y = r.
//   - θ (dsl X): every node gets its own slot, in post-order: Root juxtapose
//     bottom-up puts the parent AFTER its child group (the parentChild
//     distribute runs in reverse), and siblings follow one another. The
//     reference turns counter-clockwise from 12 o'clock, so the root takes the
//     last slot, a full-radius wedge just after 12.
//   - r (dsl Y): a parent's radial span covers its children's (include →
//     nest), and siblings follow one another (flatten → distribute). With
//     PolarCenter bottom the layout's top is the rim, so the first sibling is
//     outermost and the sequence spirals inward.
//
// SIZES. Every node is one θ unit wide. Leaves are one radial unit and
// internal nodes leave r to nest. The coord fits both.
//
// NOTES:
//  - Y Subtree Margin -0.46: GoTree overlaps each sibling with the one before
//    it by 46% of its length. GoFish has no negative gap measured in the
//    children's own size, so the siblings here only touch, and the radial
//    steps are wider than the reference's.
const meta: Meta = { title: "GoTree / Gallery / ViolinTree" };
export default meta;

const node = (d: any) =>
  d.height === 0
    ? rect({
        w: datum(1),
        h: datum(1),
        fill: byDepth()(d),
        stroke: "white",
        strokeWidth: 1,
      })
    : rect({
        w: datum(1),
        fill: byDepth()(d),
        stroke: "white",
        strokeWidth: 1,
      });

export const ViolinTree: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: "none",
        parentChild: combine({
          // θ: the child group, then the parent (bottom-up).
          x: { kind: "distribute", spacing: 0, order: "reverse" },
          // r: the parent's span covers its subtree's (Root include).
          y: { kind: "nest", pad: 0 },
        }),
        sibling: combine({
          // θ: siblings follow one another around the circle.
          x: { kind: "distribute", spacing: 0 },
          // r: and inward (PolarCenter bottom: the layout's top is the rim).
          y: { kind: "distribute", spacing: 0, order: "reverse" },
        }),
        // Counter-clockwise from 12 o'clock, as the reference turns.
        coord: Coord.polar({ baselineAngle: Math.PI / 2 }),
      },
      { w: 540, h: 540 },
      sampleTree
    ),
};
