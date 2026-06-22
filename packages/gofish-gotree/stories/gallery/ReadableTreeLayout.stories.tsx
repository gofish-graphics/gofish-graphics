import type { Meta, StoryObj } from "@storybook/html";
import { circle } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

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
// y uses order:"reverse" so the parent lands at high y = top of screen (y-up),
// matching the reference (root at top, leaves at bottom).
//
// TODO: needs orthogonal links implemented — the dsl uses orthogonal (elbow)
// links; we fall back to {interpolation:"linear"} (straight segments).
const node = (d: any) =>
  circle({ r: 8, fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 });

export const ReadableTreeLayout: StoryObj = {
  render: () =>
    mount({
      node,
      // TODO: needs orthogonal links implemented — fall back to linear.
      link: { interpolation: "linear", stroke: "#555555", strokeWidth: 2 },
      parentChild: combine({
        x: { kind: "align", alignment: "middle" },
        y: { kind: "distribute", spacing: 60, order: "reverse" },
      }),
      sibling: combine({
        x: { kind: "distribute", spacing: 18 },
        y: { kind: "align", alignment: "middle" },
      }),
    }),
};

const meta: Meta = { title: "GoTree / Gallery / ReadableTreeLayout" };
export default meta;
