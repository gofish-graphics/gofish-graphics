import type { Meta, StoryObj } from "@storybook/html";
import { circle } from "gofish-graphics";
import { tree, combine, alternate } from "../../src";
import { byDepth, sampleTree } from "../data";
import { initializeContainer } from "../helper";

// GoTree gallery port — HVDrawing (horizontal/vertical alternating tree).
// The original alternates two templates by depth (gallery dsl1 ⇄ dsl2, axes swapped):
//   dsl1: X juxtapose/flatten, Y within/align  → spread on X, align on Y  ("H")
//   dsl2: X within/align, Y juxtapose/flatten  → spread on Y, align on X  ("V")
// Expressed with `alternate([H, V])` so every level swaps the spread axis —
// THIS is what makes the HV drawing (a single fixed template collapses to a line).
const meta: Meta = {
  title: "GoTree / Gallery / HVDrawing",
};
export default meta;

const node = (d: any) =>
  circle({ r: 7, fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 });

const S = 34;
// H: parent left of subtree, children in a row (spread x, centered y).
const H = combine({
  x: { kind: "distribute", spacing: S },
  y: { kind: "align", alignment: "middle" },
});
// V: parent above subtree, children in a column (spread y, centered x).
const V = combine({
  x: { kind: "align", alignment: "middle" },
  y: { kind: "distribute", spacing: S },
});

export const HVDrawing: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: HV Drawing",
      description:
        "An HV-drawing that alternates horizontal and vertical placement by depth to draw the tree as a compact staircase.",
    },
  },
  render: () => {
    const container = initializeContainer({ w: 640, h: 420 });
    tree(
      {
        node,
        link: { interpolation: "linear", stroke: "#90a4ae", strokeWidth: 1.5 },
        mode: "bottomUp",
        // Both relations alternate in sync (resolved at the same node depth).
        parentChild: alternate([H, V]),
        sibling: alternate([H, V]),
      },
      sampleTree
    ).render(container, { w: 640, h: 420 });
    return container;
  },
};
