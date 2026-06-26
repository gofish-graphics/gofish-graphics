import type { Meta, StoryObj } from "@storybook/html";
import { circle } from "gofish-graphics";
import { tree, combine } from "../../src";
import { byDepth } from "../data";
import { initializeContainer } from "../helper";

// GoTree gallery port — NodeLinkTree (classic top-down node-link diagram).
// dsl: node=circle, link=straight, color=depth, mode=bottom-up.
//   X.Root within   / X.Subtree flatten (margin 0.3w)
//   Y.Root juxtapose (margin 0.2) / Y.Subtree align (alignment top)
// Mapping (include→nest, juxtapose/flatten→distribute, within/align→align):
//   parentChild = combine({ x: align middle (parent centered over subtree),
//                           y: distribute (parent stacked above its subtree) })
//                  on y puts the root at the TOP (y-up).
//   sibling     = combine({ x: distribute (siblings laid out flat side-by-side),
//                           y: align start (siblings share a baseline/row) })
const meta: Meta = {
  title: "GoTree / Gallery / NodeLinkTree",
};
export default meta;

// A uniform-depth tree (root → many depth-1 nodes → leaves), matching the
// reference's clean two-tier topology. Some depth-1 nodes are childless and
// sit on the same row as their siblings; the rest fan out to a few leaves.
const leaves = (n: number, p: string) =>
  Array.from({ length: n }, (_, i) => ({ name: `${p}${i}` }));
const nodeLinkData = {
  name: "root",
  children: [
    { name: "a", children: leaves(3, "a") },
    { name: "b", children: leaves(2, "b") },
    { name: "c" },
    { name: "d", children: leaves(2, "d") },
    { name: "e", children: leaves(2, "e") },
    { name: "f" },
    { name: "g" },
    { name: "h", children: leaves(4, "h") },
    { name: "i", children: leaves(4, "i") },
    { name: "j" },
    { name: "k", children: leaves(4, "k") },
    { name: "l" },
    { name: "m", children: leaves(4, "m") },
    { name: "n", children: leaves(3, "n") },
  ],
};

// Circle nodes, colored by depth (dark root → light leaves).
const node = (d: any) =>
  circle({
    r: 9,
    fill: byDepth()(d),
    stroke: "#08306b",
    strokeWidth: 1,
  });

export const NodeLinkTree: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Node-Link Tree",
      description:
        "A classic top-down node-link tree diagram with depth-colored circular nodes connected to their children.",
    },
  },
  render: () => {
    const container = initializeContainer({ w: 900, h: 560 });
    tree(
      {
        node,
        // straight links → linear interpolation.
        link: { route: "straight", stroke: "#555", strokeWidth: 1.5 },
        parentChild: combine({
          x: { kind: "align", alignment: "middle" },
          y: { kind: "distribute", spacing: 90 },
        }),
        sibling: combine({
          x: { kind: "distribute", spacing: 24 },
          // Align siblings to the TOP of their bands so every depth-1 node (even
          // childless ones) sits on one row. In y-down free space the top is the
          // near edge → "start"; otherwise a childless node bottom-aligns down to
          // the leaf row. See issue #143/#16.
          y: { kind: "align", alignment: "start" },
        }),
      },
      nodeLinkData
    ).render(container, { w: 900, h: 560 });
    return container;
  },
};
