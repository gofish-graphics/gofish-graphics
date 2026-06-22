import type { Meta, StoryObj } from "@storybook/html";
import { circle } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — HVDrawing (HV / horizontal-vertical alternating tree).
// dsl (dsl2.json): node=circle, link=straight, color=depth, mode=bottom-up.
//   X: Subtree align/left, Root within/left   → x = align (alignment "left" → "start")
//   Y: Subtree flatten,    Root juxtapose/-0.08 → y = distribute
// Mapping rules: within/align → align ; juxtapose/flatten → distribute ;
//   Alignment "left" → align "start". So:
//   parentChild = combine({ x: align "start", y: distribute (Root juxtapose, margin -0.08) })
//   sibling     = combine({ x: align "start", y: distribute (Subtree flatten) })
// Both axes are decoupled: x just left-aligns every node, y carries the spread
// (parent stacked above its subtree, siblings stacked below). Produces the
// compact, left-aligned HV layout. order:"reverse" puts the parent at HIGH y
// (top of screen, y-up) so the tree reads top-down.
const meta: Meta = { title: "GoTree / Gallery / HVDrawing" };
export default meta;

// circle nodes, colored by depth (dark root → light leaves).
const node = (d: any) =>
  circle({ r: 9, fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 });

export const HVDrawing: StoryObj = {
  render: () =>
    mount({
      node,
      // straight links → linear interpolation.
      link: { interpolation: "linear", stroke: "#90a4ae", strokeWidth: 2 },
      mode: "bottomUp",
      parentChild: combine({
        x: { kind: "align", alignment: "start" },
        y: { kind: "distribute", spacing: 8, order: "reverse" },
      }),
      sibling: combine({
        x: { kind: "align", alignment: "start" },
        y: { kind: "distribute", spacing: 8, order: "reverse" },
      }),
    }),
};
