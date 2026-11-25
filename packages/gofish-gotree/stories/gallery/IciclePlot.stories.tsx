import type { Meta, StoryObj } from "@storybook/html";
import { rect, datum } from "gofish-graphics";
import { tree, combine } from "../../src";
import { byDepth } from "../data";
import { initializeContainer } from "../helper";

// GoTree gallery port — icicleplot (a CARTESIAN icicle).
//
// REFERENCE. The gallery's icicleplot/tree.png is a cartesian icicle: the root
// is one band across the full width at the top, its children sit side by side
// in the band below it, and their children in the band below that. Its
// dsl.json and index.html are byte copies of the sunburst entry's (polar), so
// the picture is the only spec of its own. This port draws the picture, in the
// picture's cartesian coordinates; the polar form of the same layout is the
// sunburst story.
//
// MAPPING (include → nest, juxtapose/flatten → distribute, align → align):
//   parentChild = (nest x, distribute y)
//     - nest on x: the parent's band spans its children's combined width.
//     - distribute on y: the parent's band on top, its child group in the band
//       right below it, with no gap.
//   sibling = (distribute x, align y)
//     - distribute on x: siblings sit side by side, touching.
//     - align on y: siblings start on the same band (their top edges align),
//       so a leaf at depth 1 stops one band above its cousins' children.
//
// SIZES. Each leaf's width is its value (`w: datum(value)`), and an internal
// node leaves its width unsized so nest grows it to its children's sum. The
// render width fits the values, so no leaf is sized in pixels. Every band is
// the same height in pixels.
//
// NOTES:
//  - The band height is pixels, not `h: datum(1)`: with a data height, a
//    depth-1 parent lands below its own children while the root stays above
//    its children (the y order of a nested distribute flips inside a data
//    scope). That is an engine bug, reported with a four-node repro.
//  - Links="curve" and Node="circle" come from the copied sunburst dsl; the
//    picture draws filled bands with no links, so this port does too.
const meta: Meta = {
  title: "GoTree / Gallery / icicleplot",
};
export default meta;

// Sequential blue ramp (#2171b5 dark → #deebf7 light), dark at the root.
const icicleBlues = ["#2171b5", "#84aed8", "#deebf7"];

// The root's 19 children, read off the reference: a number is a leaf with that
// value, a list is a child whose leaves have those values.
const branches: (number | number[])[] = [
  10,
  [7, 5],
  [5, 5],
  16,
  3,
  [5, 9],
  [12, 1],
  4,
  7,
  3,
  [4, 3, 4],
  [5, 13, 2, 2],
  4,
  [8, 1, 3, 3],
  7,
  [5, 4, 6, 9],
  8,
  7,
  [2, 6, 6, 10],
];
const icicleData = {
  name: "root",
  children: branches.map((b, i) =>
    typeof b === "number"
      ? { name: `c${i}`, value: b }
      : {
          name: `c${i}`,
          children: b.map((value, j) => ({ name: `c${i}-${j}`, value })),
        }
  ),
};

const bandHeight = 120; // one depth band

const node = (d: any) =>
  d.height === 0
    ? rect({
        w: datum(d.data.value),
        h: bandHeight,
        fill: byDepth(icicleBlues)(d),
        stroke: "white",
        strokeWidth: 2,
      })
    : rect({
        h: bandHeight,
        fill: byDepth(icicleBlues)(d),
        stroke: "white",
        strokeWidth: 2,
      });

export const IciclePlot: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Icicle Plot",
      description:
        "An icicle plot drawing each level of the hierarchy as a band of rectangles, each as wide as its value, below its parent.",
    },
  },
  render: () => {
    const container = initializeContainer();
    tree(
      {
        node,
        link: "none",
        // parentChild: nest x (the parent spans its children) + distribute y
        // (the parent's band on top, the child group right below it).
        parentChild: combine({
          x: { kind: "nest", pad: 0 },
          y: { kind: "distribute", spacing: 0 },
        }),
        // sibling: distribute x (side by side) + align y start (one band).
        sibling: combine({
          x: { kind: "distribute", spacing: 0 },
          y: { kind: "align", alignment: "start" },
        }),
      },
      icicleData
    ).render(container, { w: 640 });
    return container;
  },
};
