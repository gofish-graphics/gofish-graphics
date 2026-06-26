import type { Meta, StoryObj } from "@storybook/html";
import { circle } from "gofish-graphics";
import { tree, combine } from "../../src";
import { byDepth, sampleTree } from "../data";
import { initializeContainer } from "../helper";

// GoTree gallery port — ReadableTreeLayout.
// dsl: node=circle, link=orthogonal, color=depth, mode=bottom-up, cartesian.
//   X.Root = within (centered) ; X.Subtree = flatten (margin 0.3w)
//   Y.Root = juxtapose (margin 0.2) ; Y.Subtree = align (alignment top)
// Mapping (within→align middle, juxtapose/flatten→distribute, align→align):
//   parentChild = (align middle x, distribute y)  → parent centered over its
//                 subtree and offset vertically from it.
//   sibling     = (distribute x, align top y)      → siblings spread across,
//                 their tops aligned on a level.
// This is a node-link tree (same layout family as NodeLinkTree). distribute on
// y uses  so the parent lands at high y = top of screen (y-up),
// matching the reference (root at top, leaves at bottom). Links use the
// `orthogonal` route (elbow connectors), matching the dsl's orthogonal links.
const node = (d: any) =>
  circle({ r: 8, fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 });

export const ReadableTreeLayout: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Readable Tree Layout",
      description:
        "A readable tree layout that distributes siblings for even spacing and routes parent-child links cleanly.",
    },
  },
  render: () => {
    const container = initializeContainer({ w: 640, h: 420 });
    tree(
      {
        node,
        link: { curve: "orthogonal", stroke: "#555555", strokeWidth: 2 },
        parentChild: combine({
          x: { kind: "align", alignment: "middle" },
          y: { kind: "distribute", spacing: 60 },
        }),
        sibling: combine({
          x: { kind: "distribute", spacing: 18 },
          y: { kind: "align", alignment: "middle" },
        }),
      },
      sampleTree
    ).render(container, { w: 640, h: 420 });
    return container;
  },
};

const meta: Meta = {
  title: "GoTree / Gallery / ReadableTreeLayout",
};
export default meta;
