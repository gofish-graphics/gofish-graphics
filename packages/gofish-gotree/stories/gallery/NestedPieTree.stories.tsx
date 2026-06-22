import type { Meta, StoryObj } from "@storybook/html";
import { rect } from "gofish-graphics";
import { combine, alternate, byDepth, mount } from "./_shared";

// GoTree gallery port — NestedPieTree (CARTESIAN nested-rectangle form).
//
// The original gallery entry is a POLAR nested-pie (DiceLayout/SliceLayout under
// a polar coordinate system); that radial version is covered separately by the
// `NestedPietree` story in Tree.stories.tsx. This port targets the cartesian
// nested-rectangle treemap where every parent rectangle CONTAINS its children on
// both axes.
//
// The gallery example actually ALTERNATES two templates by depth: DiceLayout
// (dsl2.json) and SliceLayout (dsl1.json) swap the subdivision axis every level.
//   DiceLayout (dice): X.Subtree = align, Y.Subtree = flatten → siblings stack
//                      vertically (distribute y, align x).
//   SliceLayout (slice): X.Subtree = flatten, Y.Subtree = align → siblings stack
//                      horizontally (distribute x, align y).
// Both share Root = include (pad) on both axes, so parentChild nests on both axes
// at every level (parent box wraps its subtree). Expressing sibling as
// `alternate([dice, slice])` makes the subdivision direction swap slice↔dice at
// each depth — the cartesian analogue of the radial slice/dice nesting.
const meta: Meta = { title: "GoTree / Gallery / NestedPieTree" };
export default meta;

// rectangle nodes, colored by depth. Leaves are sized by their datum value
// (height ∝ value, fixed width); internal nodes are left UNSIZED on both axes
// (the nest axes) so each parent box grows to enclose its whole subtree.
const node = (d: any) =>
  d.height === 0
    ? rect({
        w: 40,
        h: (d.data.value ?? d.width ?? 1) * 16,
        fill: byDepth()(d),
      })
    : rect({ fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 });

const P = 6; // nest padding (Root include pad)
const G = 8; // sibling distribute spacing (Subtree flatten margin)

// dice: siblings stack vertically (distribute y), sharing an x-center.
const dice = combine({
  x: { kind: "align", alignment: "middle" },
  y: { kind: "distribute", spacing: G },
});
// slice: siblings stack horizontally (distribute x), sharing a y-center.
const slice = combine({
  x: { kind: "distribute", spacing: G },
  y: { kind: "align", alignment: "middle" },
});

export const NestedPieTree: StoryObj = {
  render: () =>
    mount({
      node,
      link: "none",
      // include → nest on both axes at every level: the parent rectangle wraps
      // its subtree group horizontally and vertically with a small padding.
      parentChild: combine({
        x: { kind: "nest", pad: P },
        y: { kind: "nest", pad: P },
      }),
      // Alternate the subdivision axis by depth: slice ↔ dice every level.
      sibling: alternate([slice, dice]),
    }),
};
