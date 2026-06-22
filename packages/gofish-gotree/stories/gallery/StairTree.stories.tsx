import type { Meta, StoryObj } from "@storybook/html";
import { rect } from "gofish-graphics";
import { tree, combine } from "../../src";
import { byDepth, sampleTree } from "../data";
import { initializeContainer } from "../helper";

// GoTree gallery port — StairTree.
// dsl: X.Root juxtapose / X.Subtree flatten ; Y.Root include / Y.Subtree flatten.
//   parentChild = (distribute x, nest y)   sibling = (distribute x, distribute y)
// Each parent sits left of its subtree (distribute x) and its box wraps the
// subtree vertically (nest y); siblings step diagonally (distribute on both
// axes) — producing the cascading staircase.
const meta: Meta = {
  title: "GoTree / Gallery / StairTree",
};
export default meta;

// rectangle nodes, colored by depth. Internal nodes are left UNSIZED on y (the
// nest axis) so the parent box grows to wrap its subtree; leaves are fixed.
const node = (d: any) =>
  d.height === 0
    ? rect({ w: 34, h: 18, fill: byDepth()(d) })
    : rect({ w: 34, fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 });

export const StairTree: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Stair Tree",
      description:
        "A staircase tree where each level steps outward, nesting children along one axis while distributing along the other.",
    },
  },
  render: () => {
    const container = initializeContainer({ w: 640, h: 420 });
    tree(
      {
        node,
        link: "none",
        parentChild: combine({
          x: { kind: "distribute", spacing: 6 },
          y: { kind: "nest", pad: 6 },
        }),
        sibling: combine({
          x: { kind: "distribute", spacing: 6 },
          y: { kind: "distribute", spacing: 6 },
        }),
      },
      sampleTree
    ).render(container, { w: 640, h: 420 });
    return container;
  },
};
