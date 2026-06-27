import type { Meta, StoryObj } from "@storybook/html";
import { circle } from "gofish-graphics";
import { tree, combine } from "../../src";
import { byDepth } from "../data";
import { initializeContainer } from "../helper";

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
//  - Links: the dsl asks for "curve" links with depth-driven width. We use the
//    `bezier` route (GoTree's "curve"); depth-driven LinkWidth is still a TODO.

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
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Cartesian Deep Tree",
      description:
        "A deep cartesian node-link tree showing many levels of hierarchy with curved parent-child links.",
    },
  },
  render: () => {
    const container = initializeContainer({ w: 900, h: 520 });
    tree(
      {
        node,
        link: { curve: "bezier", stroke: "#5f6b7a", strokeWidth: 1.5 },
        parentChild: combine({
          x: { kind: "nest", pad: 0 },
          // order "reverse" puts the parent at HIGH y = the bottom in y-down
          // free space, so the root sits at the bottom and leaves climb upward
          // (matching the reference). See issue #143/#16.
          y: { kind: "distribute", spacing: 80, order: "reverse" },
        }),
        sibling: combine({
          x: { kind: "distribute", spacing: 22 },
          y: { kind: "align", alignment: "start" },
        }),
      },
      deepTree
    ).render(container, { w: 900, h: 520 });
    return container;
  },
};

const meta: Meta = {
  title: "GoTree / Gallery / cartesian-deep-tree",
};
export default meta;
