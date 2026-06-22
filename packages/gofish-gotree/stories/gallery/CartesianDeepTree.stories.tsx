import type { Meta, StoryObj } from "@storybook/html";
import { circle } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — cartesian-deep-tree.
// dsl: node=circle, color=depth, link=curve, mode=top-down, StaticSize 6.
//   X.Root include / X.Subtree flatten ; Y.Root juxtapose(0r) / Y.Subtree align(bottom).
// Mapped (include→nest, juxtapose/flatten→distribute, align→align):
//   parentChild = combine({ x: nest (parent spans/centers over its subtree),
//                           y: distribute (level stacked vertically) })
//   sibling     = combine({ x: distribute (siblings spread horizontally),
//                           y: align "start" (Alignment "bottom" → low y in y-up) })
// nest is on X ONLY: the parent is centered horizontally over the whole subtree
// span while levels stack on Y. distribute order is "forward", so the parent
// (child 0 of [parent, group]) lands at LOW y = bottom and leaves climb upward —
// matching the reference png (dark root at the bottom center, light leaves on top).
//
// COMPROMISES (noted, no hacks):
//  - Nodes are fixed-size circles. A circle can't be "unsized" on the nest axis,
//    so nest-x doesn't grow the parent — it just CENTERS the parent circle over
//    its subtree span. This matches the reference (all nodes are equal-size dots).
//  - Links: the dsl asks for "curve" links with depth-driven width. curve link
//    interpolation is not implemented, so we fall back to a fixed-width linear
//    link. // TODO: needs curve links implemented (and depth-driven LinkWidth).

// A deep balanced binary tree (4 levels, 16 leaves) — the "deep" in the title.
const deepTree = (() => {
  const make = (depth: number, prefix: string): any =>
    depth === 0
      ? { name: prefix }
      : {
          name: prefix,
          children: [
            make(depth - 1, prefix + "a"),
            make(depth - 1, prefix + "b"),
          ],
        };
  return make(4, "r");
})();

// circle nodes, depth-colored (StaticSize 6 → r 6).
const node = (d: any) =>
  circle({ r: 6, fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 });

export const CartesianDeepTree: StoryObj = {
  render: () =>
    mount(
      {
        node,
        // TODO: needs curve links implemented — falling back to linear.
        link: { interpolation: "linear", stroke: "#5f6b7a", strokeWidth: 1.5 },
        parentChild: combine({
          x: { kind: "nest", pad: 0 },
          y: { kind: "distribute", spacing: 80 },
        }),
        sibling: combine({
          x: { kind: "distribute", spacing: 22 },
          y: { kind: "align", alignment: "start" },
        }),
      },
      { w: 900, h: 520 },
      deepTree
    ),
};

export default {
  title: "GoTree / Gallery / cartesian-deep-tree",
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Cartesian Deep Tree",
      description:
        "A deep cartesian node-link tree showing many levels of hierarchy with curved parent-child links.",
    },
  },
} as Meta;
