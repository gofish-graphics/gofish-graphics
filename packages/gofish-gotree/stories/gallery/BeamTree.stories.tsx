import type { Meta, StoryObj } from "@storybook/html";
import { rect } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — BeamTree.
// dsl: HorizontalBeamTree — X.Root include / X.Subtree flatten (margin 0.41) ;
//   Y.Root include / Y.Subtree align. (mode bottom-up, node=rectangle,
//   link=none, color=depth, leaves sized by value/width.)
//   parentChild = (nest x, nest y)      sibling = (distribute x, align y)
// Each parent rectangle GROWS to enclose its subtree on both axes (nest x+y),
// so the tree renders as nested "beams". Siblings spread horizontally
// (distribute x) on a shared vertical center (align y). Leaves carry the size
// (width ∝ value); internal nodes are unsized so their boxes wrap the children.
const meta: Meta = { title: "GoTree / Gallery / BeamTree" };
export default meta;

// rectangle nodes, colored by depth (dark root → light leaves). Leaves are
// sized by datum — width ∝ value, a fixed tall height — so the beams are
// proportional. Internal nodes are left UNSIZED on both axes (the nest axes)
// so each parent box grows to wrap its subtree plus padding.
const LEAF_W = 14; // px per unit of value
const LEAF_H = 200; // fixed beam height
const node = (d: any) =>
  d.height === 0
    ? rect({
        w: LEAF_W * (d.data.value ?? d.width ?? 1),
        h: LEAF_H,
        fill: byDepth()(d),
      })
    : rect({ fill: byDepth()(d) });

export const BeamTree: StoryObj = {
  render: () =>
    mount({
      node,
      link: "none",
      parentChild: combine({
        x: { kind: "nest", pad: 4 },
        // Negative y-pad recreates the "bottom-up beam" overhang: each parent
        // box is SHORTER than its children, so the children stick out above
        // and below the thin parent band (gotree's Y.Root negative padding).
        y: { kind: "nest", pad: -42 },
      }),
      sibling: combine({
        x: { kind: "distribute", spacing: 8 },
        y: { kind: "align", alignment: "middle" },
      }),
    }),
};
