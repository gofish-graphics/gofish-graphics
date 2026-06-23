import type { Meta, StoryObj } from "@storybook/html";
import { rect } from "gofish-graphics";
import { tree, combine, alternate } from "../../src";
import { byDepth, sampleTree } from "../data";
import { initializeContainer } from "../helper";

// GoTree gallery port — CascadedTreemap.
// The original cascades two alternating templates by depth (gallery dsl1 ⇄ dsl2,
// axes swapped), mode top-down:
//   dsl1 (DiceLayout): X align, Y flatten   → align x, distribute y  ("slice")
//   dsl2 (SliceLayout): X flatten, Y align  → distribute x, align y  ("dice")
// Expressed with `alternate([dice, slice])` so subdivision swaps slice↔dice
// every level — THIS is the cascade: each depth subdivides on the opposite axis.
//
// parentChild = nest on BOTH axes (constant per depth) ⇒ internal nodes are
// UNSIZED on both axes (the parent box grows to enclose its subtree). A small
// nest pad adds a nested inset border at every level (the visible "cascade").
// Only LEAVES carry intrinsic size, driven by the datum value.
const meta: Meta = {
  title: "GoTree / Gallery / CascadedTreemap",
};
export default meta;

const node = (d: any) =>
  d.height === 0
    ? rect({
        w: 18 + d.data.value * 10,
        h: 18 + d.data.value * 10,
        fill: byDepth()(d),
        stroke: "#08306b",
        strokeWidth: 1,
      })
    : rect({ fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 });

const P = 6; // small nest pad → visible cascade inset border per level
const G = 8; // sibling spacing

// dice: siblings spread on X, share a vertical center.
const dice = combine({
  x: { kind: "distribute", spacing: G },
  y: { kind: "align", alignment: "middle" },
});
// slice: siblings spread on Y, share a horizontal center.
const slice = combine({
  x: { kind: "align", alignment: "middle" },
  y: { kind: "distribute", spacing: G },
});

export const CascadedTreemap: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Cascaded Treemap",
      description:
        "A cascaded treemap that alternates slice and dice subdivision at each level to nest child rectangles inside their parents.",
    },
  },
  render: () => {
    const container = initializeContainer({ w: 640, h: 420 });
    tree(
      {
        node,
        link: "none",
        // nest on both axes → parent rect encloses its subtree with a small pad.
        parentChild: combine({
          x: { kind: "nest", pad: P },
          y: { kind: "nest", pad: P },
        }),
        // siblings alternate subdivision axis per depth (the cascade).
        sibling: alternate([dice, slice]),
      },
      sampleTree
    ).render(container, { w: 640, h: 420 });
    return container;
  },
};
