import type { Meta, StoryObj } from "@storybook/html";
import { circle } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — arc-tree.
// dsl: X.Root juxtapose / X.Subtree flatten ; Y.Root within / Y.Subtree align.
//   parentChild = (distribute x, align y)   sibling = (distribute x, align y)
// Every node — parent or sibling — is distributed along x and aligned to a
// shared y baseline, so the whole tree collapses onto a single horizontal
// line. The hierarchy then shows only through the (arc) links connecting
// each node to its relatives.
// Links use the `arc` route — GoTree's `arccurve` (ArcDirection "top"):
// each link is a semicircle through the two nodes, center at their midpoint,
// radius half the chord, so siblings stack as nested semicircular arcs.
const meta: Meta = { title: "GoTree / Gallery / arc-tree" };
export default meta;

const node = (d: any) =>
  circle({ r: 6, fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 });

export const ArcTree: StoryObj = {
  render: () =>
    mount({
      node,
      link: { curve: "arc", stroke: "#90a4ae", strokeWidth: 1.5 },
      parentChild: combine({
        x: { kind: "distribute", spacing: 14 },
        y: { kind: "align", alignment: "middle" },
      }),
      sibling: combine({
        x: { kind: "distribute", spacing: 14 },
        y: { kind: "align", alignment: "middle" },
      }),
    }),
};
