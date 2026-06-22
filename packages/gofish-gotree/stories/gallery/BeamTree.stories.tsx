import type { Meta, StoryObj } from "@storybook/html";
import { rect } from "gofish-graphics";
import { combine, alternate, byDepth, mount } from "./_shared";

// GoTree gallery port — BeamTree (alternating nested beams).
// The original gallery alternates two templates by depth (dsl1 ⇄ dsl2, axes
// swapped):
//   dsl1 HorizontalBeamTree: X include/flatten, Y include/align → spread x
//   dsl2 VerticalBeamTree:   X include/align,   Y include/flatten → spread y
// Both keep parent⊇subtree on BOTH axes (X.Root include + Y.Root include), so
// every parent rectangle GROWS to enclose its subtree → nested "beams".
// Expressed with `alternate([spreadX, spreadY])` so the subdivision axis swaps
// at every depth: the root lays children out in a row, those children stack
// their children in a column, and so on. Leaves carry the size (∝ value);
// internal nodes are unsized so their boxes wrap the children plus padding.
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

const G = 8; // sibling gap
const P = 6; // nest padding (parent box wraps its subtree on both axes)

// parent ⊇ subtree on BOTH axes at every level → nested beams.
const parentChild = combine({
  x: { kind: "nest", pad: P },
  y: { kind: "nest", pad: P },
});
// siblings alternate the spread axis by depth: row, then column, then row…
const spreadX = combine({
  x: { kind: "distribute", spacing: G },
  y: { kind: "align", alignment: "middle" },
});
const spreadY = combine({
  x: { kind: "align", alignment: "middle" },
  y: { kind: "distribute", spacing: G },
});
const sibling = alternate([spreadX, spreadY]);

// NOTE: gotree's reference uses asymmetric per-side negative Y.Root padding to
// make the parent band overhang its children. GoFish nest pad is symmetric, so
// that exact overhang nuance isn't expressible here; we use a small positive
// pad for clean nested beams instead.
// TODO: asymmetric per-side nest padding isn't expressible via `combine`.
export const BeamTree: StoryObj = {
  render: () =>
    mount({
      node,
      link: "none",
      parentChild,
      sibling,
    }),
};
