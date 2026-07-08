import type { Meta, StoryObj } from "@storybook/html";
import { circle } from "gofish-graphics";
import { tree, combine } from "../../src";
import { byDepth, sampleTree } from "../data";
import { initializeContainer } from "../helper";

// GoTree gallery port — OrthogonalTree.
// dsl: Mode bottom-up; X.Root juxtapose / X.Subtree flatten ; Y.Root juxtapose
//   / Y.Subtree flatten ; Node circle, Color depth, Link curveStepBefore.
//   parentChild = (distribute x, distribute y)   sibling = (distribute x, distribute y)
// Every relationship distributes on BOTH axes: a parent sits up-left of its
// subtree and each sibling steps further down-right, so the whole tree cascades
// along a diagonal — the classic orthogonal node-link "staircase" grid.
// Links use the `orthogonal` route: right-angle elbows bending at the
// parent↔child midpoint (GoTree's orthogonal link, `ue`).
const meta: Meta = {
  title: "GoTree / Gallery / OrthogonalTree",
};
export default meta;

const node = (d: any) =>
  circle({ r: 7, fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 });

export const OrthogonalTree: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Orthogonal Tree",
      description:
        "A node-link tree drawn with orthogonal right-angle link routing between parents and children.",
    },
  },
  render: () => {
    const container = initializeContainer({ w: 640, h: 420 });
    tree(
      {
        node,
        link: { curve: "orthogonal", stroke: "#90a4ae", strokeWidth: 1.5 },
        // parent up-left of its subtree: distribute x forward (parent at low x =
        // left), distribute y reverse (parent at high y = top, GoFish is y-up).
        parentChild: combine({
          x: { kind: "distribute", spacing: 18 },
          y: { kind: "distribute", spacing: 18 },
        }),
        // siblings step down-right: each later sibling further right (x forward)
        // and lower (y reverse) → the diagonal cascade.
        sibling: combine({
          x: { kind: "distribute", spacing: 18 },
          y: { kind: "distribute", spacing: 18 },
        }),
      },
      sampleTree
    ).render(container, { w: 640, h: 420 });
    return container;
  },
};
