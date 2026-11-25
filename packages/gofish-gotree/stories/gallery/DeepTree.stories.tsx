import type { Meta, StoryObj } from "@storybook/html";
import { circle, Curve } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — deep-tree (a CARTESIAN top-down node-link tree with
// thick curved links).
//
// REFERENCE. The gallery's deep-tree/tree.png is cartesian: the root at the top
// center, its 19 children on one row below it, and their leaves on a row below
// that, joined by thick curved links. Its dsl.json is a byte copy of the
// sunburst entry's (polar), so the picture is the only spec of its own. This
// port draws the picture, in the picture's cartesian coordinates. The copied
// dsl's layout and element settings still read right for the picture:
//   X.Root include   / X.Subtree flatten → parentChild nest x, sibling distribute x
//   Y.Root juxtapose / Y.Subtree align   → parentChild distribute y, sibling align y
//   Link curve, LinkWidth depth           → bezier links, thicker near the root
//
// MAPPING:
//   parentChild = (nest x, distribute y)
//     - nest on x: the parent is centered over its subtree's span (a circle
//       does not grow, so nest only centers it).
//     - distribute on y: the parent on its row, the child group on the row
//       below.
//   sibling = (distribute x, align y)
//     - distribute on x: siblings side by side.
//     - align on y "start": siblings share their top edge, so a childless
//       depth-1 node stays on its row.
//
// NOTES:
//  - LinkWidth=depth: the link's width is read off the parent's depth.
const meta: Meta = { title: "GoTree / Gallery / deep-tree" };
export default meta;

// The root's 19 children and how many leaves each has, read off the reference.
const leafCounts = [0, 2, 2, 0, 0, 2, 2, 0, 0, 0, 3, 4, 0, 4, 0, 4, 0, 0, 4];
const deepTree = {
  name: "root",
  children: leafCounts.map((n, i) =>
    n === 0
      ? { name: `c${i}` }
      : {
          name: `c${i}`,
          children: Array.from({ length: n }, (_, j) => ({
            name: `c${i}-${j}`,
          })),
        }
  ),
};

// ColorRange #2171b5 → #deebf7 by depth.
const deepBlues = ["#2171b5", "#84aed8", "#deebf7"];
const node = (d: any) =>
  circle({
    r: 8,
    fill: byDepth(deepBlues)(d),
    stroke: "white",
    strokeWidth: 2,
  });

// LinkWidth=depth: links out of the root are the thickest.
const linkWidths = [9, 6];

export const DeepTree: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: (source: any) => ({
          curve: Curve.bezier(),
          stroke: "#606060",
          strokeWidth: linkWidths[source.depth],
        }),
        parentChild: combine({
          x: { kind: "nest", pad: 0 },
          y: { kind: "distribute", spacing: 180 },
        }),
        sibling: combine({
          x: { kind: "distribute", spacing: 4 },
          y: { kind: "align", alignment: "start" },
        }),
      },
      {},
      deepTree
    ),
};
