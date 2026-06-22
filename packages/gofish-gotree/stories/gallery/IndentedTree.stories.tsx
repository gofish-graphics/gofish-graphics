import type { Meta, StoryObj } from "@storybook/html";
import { rect } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — IndentedTree.
// dsl: AxisIndependent, bottom-up.
//   X.Root = within / left    → align (alignment "start", flush-left)
//   X.Subtree = align         → align (flush-left to match the reference)
//   Y.Root = juxtapose        → distribute
//   Y.Subtree = flatten       → distribute
// So both relationships are (align x, distribute y):
//   parentChild = combine({ x: align start, y: distribute })
//   sibling     = combine({ x: align start, y: distribute })
// The classic indented / outline tree: every node is a row, children stack
// directly below their parent (distribute y) and every node shares the same
// left edge (align x "start"). There is no indentation — the dsl encodes
// depth instead via Element.RootWidth = "rdepth" (reverse depth: the root is
// the widest bar, leaves the narrowest) plus Color = depth. distribute uses
// order:"reverse" so y-up places the parent/first-child at the TOP and the
// subtree stacks downward.
const meta: Meta = {
  title: "GoTree / Gallery / IndentedTree",
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Indented Tree",
      description:
        "An indented outline tree, like a file explorer, with each level nested and stacked vertically.",
    },
  },
};
export default meta;

// sampleTree's deepest path is root → B → B2 → B2b, so maxDepth = 3.
// "rdepth" => bar width grows toward the root (widest) and shrinks toward the
// leaves (narrowest), approximated with a depth-based linear width.
const maxDepth = 3;
const node = (d: any) =>
  rect({
    w: 16 + (maxDepth - d.depth) * 26,
    h: 16,
    fill: byDepth()(d),
  });

const layout = combine({
  x: { kind: "align", alignment: "start" },
  y: { kind: "distribute", spacing: 4, order: "reverse" },
});

export const IndentedTree: StoryObj = {
  render: () =>
    mount({
      node,
      // gotree link = "none" → no connectors in the indented/outline layout.
      link: "none",
      parentChild: layout,
      sibling: layout,
    }),
};
