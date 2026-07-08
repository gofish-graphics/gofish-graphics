import type { Meta, StoryObj } from "@storybook/html";
import { rect } from "gofish-graphics";
import { tree, combine } from "../../src";
import { byDepth, sampleTree } from "../data";
import { initializeContainer } from "../helper";

// GoTree gallery port — iptp.
// dsl: mode bottom-up; X.Root juxtapose / X.Subtree flatten ;
//      Y.Root juxtapose / Y.Subtree align(top).
//   parentChild = (distribute x, distribute y)  — parent juxtaposed against its
//     subtree on BOTH axes, so each level steps down (y) and across (x).
//   sibling = (distribute x, align y[top→"end" in y-up]) — siblings flatten
//     along x and share a top edge.
// node = rectangle colored by depth, links = none.
const meta: Meta = {
  title: "GoTree / Gallery / iptp",
};
export default meta;

// Uniform tall-bar rectangle nodes, colored by depth (dark root → light leaves).
const node = (d: any) => rect({ w: 16, h: 90, fill: byDepth()(d) });

export const Iptp: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Indented Pixel Tree",
      description:
        "An indented pixel-tree plot that lays out the hierarchy as a dense grid of nested rectangles.",
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
          //  puts the parent at HIGH y (top of screen, y-up) so the
          // root sits above its subtree — matching the reference's root-at-top.
          y: { kind: "distribute", spacing: 6 },
        }),
        sibling: combine({
          x: { kind: "distribute", spacing: 6 },
          // Align siblings to the TOP of their bands (y-down free space: "start"
          // = near/top edge) so same-depth nodes share a row. See #143/#16.
          y: { kind: "align", alignment: "start" },
        }),
      },
      sampleTree
    ).render(container, { w: 640, h: 420 });
    return container;
  },
};
