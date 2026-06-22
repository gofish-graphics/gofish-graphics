import type { Meta, StoryObj } from "@storybook/html";
import { circle } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — OrthogonalTree.
// dsl: Mode bottom-up; X.Root juxtapose / X.Subtree flatten ; Y.Root juxtapose
//   / Y.Subtree flatten ; Node circle, Color depth, Link curveStepBefore.
//   parentChild = (distribute x, distribute y)   sibling = (distribute x, distribute y)
// Every relationship distributes on BOTH axes: a parent sits up-left of its
// subtree and each sibling steps further down-right, so the whole tree cascades
// along a diagonal — the classic orthogonal node-link "staircase" grid.
//
// TODO: needs step/orthogonal links implemented — GoTree's Link is
//   `curveStepBefore` (right-angle elbow connectors), which the link renderer
//   does not yet support, so links fall back to {interpolation:"linear"}.
const meta: Meta = {
  title: "GoTree / Gallery / OrthogonalTree",
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Orthogonal Tree",
      description:
        "A node-link tree drawn with orthogonal right-angle link routing between parents and children.",
    },
  },
};
export default meta;

const node = (d: any) =>
  circle({ r: 7, fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 });

export const OrthogonalTree: StoryObj = {
  render: () =>
    mount({
      node,
      // TODO: needs step/orthogonal links implemented — fall back to linear.
      link: { interpolation: "linear", stroke: "#90a4ae", strokeWidth: 1.5 },
      // parent up-left of its subtree: distribute x forward (parent at low x =
      // left), distribute y reverse (parent at high y = top, GoFish is y-up).
      parentChild: combine({
        x: { kind: "distribute", spacing: 18 },
        y: { kind: "distribute", spacing: 18, order: "reverse" },
      }),
      // siblings step down-right: each later sibling further right (x forward)
      // and lower (y reverse) → the diagonal cascade.
      sibling: combine({
        x: { kind: "distribute", spacing: 18 },
        y: { kind: "distribute", spacing: 18, order: "reverse" },
      }),
    }),
};
