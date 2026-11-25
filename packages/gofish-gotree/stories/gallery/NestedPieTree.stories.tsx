import type { Meta, StoryObj } from "@storybook/html";
import { rect, datum, Coord } from "gofish-graphics";
import { tree, combine, alternate } from "../../src";
import { byDepth } from "../data";
import { initializeContainer } from "../helper";

// GoTree gallery port — NestedPieTree (a POLAR nested pie).
//
// REFERENCE. The gallery's NestedPieTree/tree.png is polar: the root is a disc,
// its children are wedges around it, each as wide as its value, and a wedge's
// own children are bands stacked outward inside it, each as thick as its
// value. dsl0.json applies the template SliceLayout (dsl1.json, polar) by
// depth; the picture alternates it with DiceLayout (dsl2.json), which splits
// the radius instead of the angle, so this port alternates the two.
//   SliceLayout: X.Subtree flatten / Y.Subtree align, SubtreeWidth value
//                → siblings split the angle by value, sharing a ring
//   DiceLayout:  X.Subtree align / Y.Subtree flatten, SubtreeHeight value
//                → siblings split the radius by value, sharing an arc
//   Both:        X.Root include / Y.Root include → the parent wraps its
//                children on both axes (nest θ, nest r)
// Under polar(): x = θ, y = r.
//
// SIZES. A node is sized only along the axis its parent's template splits:
// in a slice its angle is its value (`w: datum(value)`), in a dice its
// thickness is (`h: datum(value)`). An internal node's value is the sum of its
// leaves', as in GoTree. The other axis is left unsized, so the node fills its
// parent there (GoTree's "adaptive"): a wedge with no children runs from the
// hub to the rim. The coord fits the angle weights to the full turn and the
// thickness weights to the radius, so nothing is sized in radians.
//
// NOTES — what this port cannot match:
//  - A wedge's bands are sized against one radial scale shared by the whole
//    pie, so a wedge whose bands sum to less stops short of the rim, where
//    GoTree fills each wedge to the rim and splits it by value inside.
//  - The dsl's Margin (0.20 of a slice, 0.15 of a dice) and the angular
//    Padding are shares of the data, and a gap in a coord can be pixels or
//    `fr`, not data units (`fr` beside data weights warns, and a percent in a
//    coord is #1238). So siblings touch on the angle, a white stroke parts
//    them, and only the radial padding and gaps (pixels) are drawn.
const meta: Meta = {
  title: "GoTree / Gallery / NestedPieTree",
};
export default meta;

// The root's 19 wedges, read clockwise off the reference: a number is a wedge
// with that value, a list is a wedge whose bands have those values.
const wedges: (number | number[])[] = [
  [3, 2, 2, 1],
  4,
  5,
  [3, 2, 1, 1],
  3,
  [3, 2, 2, 1],
  1.5,
  [4, 2, 2],
  [2, 2],
  1,
  2,
  3,
  [3, 2],
  [4, 3],
  1.5,
  5,
  [3, 2],
  [3, 2],
  4,
];
const pieData = {
  name: "root",
  children: wedges.map((w, i) =>
    typeof w === "number"
      ? { name: `w${i}`, value: w }
      : {
          name: `w${i}`,
          children: w.map((value, j) => ({ name: `w${i}-${j}`, value })),
        }
  ),
};

// A node's value: its own, or the sum of its leaves'.
const total = (n: any): number =>
  n.children
    ? n.children.reduce((sum: number, c: any) => sum + total(c), 0)
    : n.value;

const pieBlues = ["#2171b5", "#84aed8", "#deebf7"];

// slice: siblings split the angle (distribute θ) and share a ring (align r).
const slice = combine({
  x: { kind: "distribute", spacing: 0 },
  y: { kind: "align", alignment: "start" },
});
// dice: siblings split the radius (distribute r) and share an arc (align θ).
const dice = combine({
  x: { kind: "align", alignment: "middle" },
  y: { kind: "distribute", spacing: 4 },
});

// The root's children are sliced, theirs diced, and so on (`alternate` below),
// so a node at an odd depth sits in a slice and one at an even depth in a dice.
const node = (d: any) => {
  const style = {
    fill: byDepth(pieBlues)(d),
    stroke: "white",
    strokeWidth: 1.5,
  };
  if (d.depth === 0) return rect(style);
  const value = datum(total(d.data));
  return d.depth % 2 === 1
    ? rect({ w: value, ...style })
    : rect({ h: value, ...style });
};

export const NestedPieTree: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Nested Pie Tree",
      description:
        "A nested pie that splits the circle into wedges by value and each wedge into rings by its children's values, alternating angle and radius by depth.",
    },
  },
  render: () => {
    const container = initializeContainer();
    tree(
      {
        node,
        link: "none",
        // include → nest on both axes: the parent wraps its children, with a
        // 4 px radial padding (a dark rim at the root's edge and hub).
        parentChild: combine({
          x: { kind: "nest", pad: 0 },
          y: { kind: "nest", pad: 4 },
        }),
        // Alternate the split by depth: slice, then dice, then slice…
        sibling: alternate([slice, dice]),
        coord: Coord.clock(),
      },
      pieData
    ).render(container, { w: 520, h: 520 });
    return container;
  },
};
