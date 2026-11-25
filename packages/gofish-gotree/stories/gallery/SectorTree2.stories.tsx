import type { Meta, StoryObj } from "@storybook/html";
import { rect, datum, Coord } from "gofish-graphics";
import { tree, combine } from "../../src";
import { byDepth } from "../data";
import { initializeContainer } from "../helper";

// GoTree gallery port — SectorTree2 (an icicle with its levels laid around the
// angle and its leaves along the radius: the root is the left half-disc).
// dsl: Element{Node:rectangle, Color:depth, Link:curve, Thickness:static 2} ;
//   CoordinateSystem polar {PolarAxis:x-axis, PolarCenter:right} ;
//   Layout AxisIndependent X{Root:include, Subtree:flatten}
//                          Y{Root:juxtapose, Subtree:align}, Mode:top-down.
//
// PolarAxis: x-axis puts the layout's X on the RADIUS and its Y on the ANGLE.
// GoFish's polar always reads x as θ and y as r, so the port writes the X
// relations on `y` and the Y relations on `x`:
//   - r (dsl X): the parent's radial span includes its children's (nest), and
//     siblings are flattened outward (distribute), so the leaves split the
//     radius between them.
//   - θ (dsl Y): each level takes the next angular slot after its parent
//     (juxtapose, top-down: the parent first), and siblings start on the same
//     angle (align "start").
//
// SIZES. Leaves carry a unit radial weight and internal nodes none (nest grows
// each to its children's span). On θ, GoTree sizes a parent like its child
// group ("SubtreeHeight: adaptive"), so a node of height h takes 2^(h−1) units
// and a leaf 1: the root takes half the turn, the next level a quarter, and so
// on. The coord fits both.
//
// The reference turns counter-clockwise from 12 o'clock (the root fills the
// left half), which is `Coord.polar({ baselineAngle: π/2 })`.
//
// NOTES:
//  - Link:curve — filled sectors draw no links (link:"none").
//  - Thickness:static 2 maps to the wedge stroke width.
const meta: Meta = {
  title: "GoTree / Gallery / SectorTree2",
};
export default meta;

// Balanced binary tree, 4 levels deep → 16 leaves.
const deepBalancedTree = (() => {
  const make = (depth: number, prefix = ""): any =>
    depth === 0
      ? { name: prefix }
      : {
          name: prefix || "root",
          children: [
            make(depth - 1, prefix + "L"),
            make(depth - 1, prefix + "R"),
          ],
        };
  return make(4);
})();

// A node's angular slot, in leaf slots: a parent is as long as its child group.
const slots = (d: any) => (d.height === 0 ? 1 : 2 ** (d.height - 1));

const node = (d: any) =>
  d.height === 0
    ? rect({
        w: datum(slots(d)),
        h: datum(1),
        fill: byDepth()(d),
        stroke: "white",
        strokeWidth: 2,
      })
    : rect({
        w: datum(slots(d)),
        fill: byDepth()(d),
        stroke: "white",
        strokeWidth: 2,
      });

export const SectorTree2: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Sector Tree",
      description:
        "A polar sector tree that lays its levels around the angle and splits the radius among its leaves.",
    },
  },
  render: () => {
    const container = initializeContainer();
    tree(
      {
        node,
        link: "none",
        // parentChild: θ — the child group in the next angular slot;
        // r — the parent spans its children's radial range.
        parentChild: combine({
          x: { kind: "distribute", spacing: 0 },
          y: { kind: "nest", pad: 0 },
        }),
        // sibling: θ — siblings start on the same angle; r — they split the
        // radius outward.
        sibling: combine({
          x: { kind: "align", alignment: "start" },
          y: { kind: "distribute", spacing: 0 },
        }),
        coord: Coord.polar({ baselineAngle: Math.PI / 2 }),
      },
      deepBalancedTree
    ).render(container, { w: 540, h: 540 });
    return container;
  },
};
