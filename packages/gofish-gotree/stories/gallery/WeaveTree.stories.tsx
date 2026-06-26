import type { Meta, StoryObj } from "@storybook/html";
import { circle } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — WeaveTree.
// dsl: X.Root juxtapose(margin 0) / X.Subtree flatten(margin 0.15) ;
//      Y.Root within(top) / Y.Subtree flatten ; mode bottom-up.
//   parentChild = (distribute x, align y top)   sibling = (distribute x, distribute y)
// Mapping: juxtapose/flatten→distribute, within→align, "top"→high y in y-up→"end".
// Each parent sits left of its subtree (distribute x) and aligns to its
// subtree's top edge (align y "end"); siblings spread on BOTH axes (distribute
// x and y) so every sibling steps diagonally — the woven, braided look.
// TODO: needs curve links implemented — dsl Link is "curve" but the gotree
// LinkSpec only supports interpolation linear/bezier/orthogonal/arc, so we
// fall back to { route: "straight" }.
const meta: Meta = { title: "GoTree / Gallery / WeaveTree" };
export default meta;

const node = (d: any) => circle({ r: 6, fill: byDepth()(d) });

export const WeaveTree: StoryObj = {
  render: () =>
    mount({
      node,
      // TODO: needs curve links implemented
      link: { route: "straight", stroke: "#666", strokeWidth: 1 },
      parentChild: combine({
        x: { kind: "distribute", spacing: 8 },
        y: { kind: "align", alignment: "end" },
      }),
      sibling: combine({
        x: { kind: "distribute", spacing: 12 },
        y: { kind: "distribute", spacing: 12 },
      }),
    }),
};
