import type { Meta, StoryObj } from "@storybook/html";
import { circle } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — HTreeLayout.
// dsl (HorizontalLinearLayout, mode bottom-up):
//   X.Subtree flatten (margin 0.01) / X.Root within ;
//   Y.Subtree align            / Y.Root within.
//   parentChild = (align x, align y)        // parent centered within its
//                                           // child-group on BOTH axes (within)
//   sibling     = (distribute x margin 0.01, align y)  // children in a row,
//                                           // flattened on x, aligned on y
// Mapping rules: within → align(middle); flatten/juxtapose → distribute;
// align → align. Margin 0.01 is a domain fraction in GoTree; mapped here to a
// small explicit pixel spacing between siblings.
//
// TODO (limitation): the reference PNG is the *recursive* H-tree fractal, which
// GoTree builds (gallery dsl0) by ALTERNATING two templates by depth —
// HorizontalLinearLayout at even depths, VerticalLinearLayout at odd depths.
// gofish-gotree's `tree()` applies a single, depth-independent
// parentChild/sibling combiner, so it can only express one of the two
// templates. This story ports the HorizontalLinearLayout template (dsl2)
// faithfully; the full depth-alternating H-fractal can't be expressed with a
// single combiner and is out of scope for the combine({x,y}) DSL.
const meta: Meta = { title: "GoTree / Gallery / HTreeLayout" };
export default meta;

// Circle nodes, colored by depth (dark root → light leaves), static size 14
// (r = 7), matching the dsl Element block.
const node = (d: any) => circle({ r: 7, fill: byDepth()(d) });

// A balanced binary tree gives the linear layout a regular, H-tree-flavored
// structure to lay out (the reference uses a deep balanced tree).
const balancedTree = (() => {
  const make = (depth: number, prefix = "r"): any =>
    depth === 0
      ? { name: prefix }
      : {
          name: prefix,
          children: [
            make(depth - 1, prefix + "L"),
            make(depth - 1, prefix + "R"),
          ],
        };
  return make(3);
})();

export const HTreeLayout: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: { interpolation: "linear", stroke: "#90a4ae", strokeWidth: 2 },
        // Root `within` on both axes → parent centered inside its child-group.
        parentChild: combine({
          x: { kind: "align", alignment: "middle" },
          y: { kind: "align", alignment: "middle" },
        }),
        // Subtree: flatten on x (distribute, small margin) + align on y.
        sibling: combine({
          x: { kind: "distribute", spacing: 24 },
          y: { kind: "align", alignment: "middle" },
        }),
      },
      { w: 640, h: 420 },
      balancedTree
    ),
};
