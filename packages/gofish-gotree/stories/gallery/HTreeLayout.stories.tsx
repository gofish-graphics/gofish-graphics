import type { Meta, StoryObj } from "@storybook/html";
import { circle } from "gofish-graphics";
import { combine, alternate, byDepth, mount } from "./_shared";

// GoTree gallery port — HTreeLayout (the recursive H-tree fractal).
// GoTree builds this (gallery dsl0) by ALTERNATING two templates by depth:
//   dsl2 HorizontalLinearLayout: X.Subtree flatten / Y.Subtree align  → spread x
//   dsl1 VerticalLinearLayout:   X.Subtree align   / Y.Subtree flatten → spread y
// Both keep Root `within` on both axes → parent centered inside its child-group.
//
// gofish-gotree's depth-aware combiner `alternate([A, B])` resolves at each
// node's depth, so the SIBLING spread axis swaps every level — exactly what the
// H-fractal needs. parentChild stays a constant (parent centered on both axes);
// only the sibling spread axis alternates H ⇄ V.
// Mapping rules: within → align(middle); flatten/juxtapose → distribute.
const meta: Meta = { title: "GoTree / Gallery / HTreeLayout" };
export default meta;

// Circle nodes, colored by depth (dark root → light leaves), static size 14
// (r = 7), matching the dsl Element block.
const node = (d: any) => circle({ r: 7, fill: byDepth()(d) });

// A deep balanced binary tree so the fractal has enough levels to read as an
// H-tree (the reference uses a deep balanced tree).
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
  return make(4);
})();

// Sibling spacing: the alternating axes need different reach so the squares
// nest cleanly (classic H-tree halves the segment length each level, but a
// fixed spacing already reads as the recursive H).
const S = 64;

// Even depths spread siblings horizontally, odd depths vertically — the H ⇄ V
// swap that draws the H-tree.
const H = combine({
  x: { kind: "distribute", spacing: S },
  y: { kind: "align", alignment: "middle" },
});
const V = combine({
  x: { kind: "align", alignment: "middle" },
  y: { kind: "distribute", spacing: S },
});

export const HTreeLayout: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: { interpolation: "linear", stroke: "#90a4ae", strokeWidth: 2 },
        // Parent centered inside its child-group on BOTH axes (Root `within`).
        parentChild: combine({
          x: { kind: "align", alignment: "middle" },
          y: { kind: "align", alignment: "middle" },
        }),
        // Sibling spread axis alternates by depth → the recursive H-fractal.
        sibling: alternate([H, V]),
      },
      { w: 720, h: 560 },
      balancedTree
    ),
};
