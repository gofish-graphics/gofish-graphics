import type { Meta, StoryObj } from "@storybook/html";
import { rect, datum, Coord } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — ClockTree (nodes arranged around a clock-face ring).
// dsl: Element{Node:rectangle, RootHeight:rdepth, Color:depth} ; Link none ;
//   Layout bottom-up X{Subtree:flatten, Root:juxtapose} Y{Subtree:align,
//   Root:within/bottom} ; CoordinateSystem polar {StartAngle:0.01,
//   InnerRadius:0.72}.
//
// MAPPING. Under polar(): x = θ, y = r.
//   parentChild = (distribute θ, align r) ; sibling = (distribute θ, align r)
//   Every node, parent or child, gets its own angular slot, and the nested
//   distributes compose into one flat sequence around the rim. The dsl's Mode
//   is bottom-up, so a parent comes AFTER its children: the parentChild
//   distribute runs in reverse order, and the root takes the last slot, just
//   before 12 o'clock.
//   Y.Root within / bottom: every node sits on the same edge, the OUTER rim
//   ("end" on r), and grows inward by its reverse depth (RootHeight: rdepth),
//   so the root is the tallest wedge and the deepest leaves the shortest.
//
// SIZES. Each node's θ extent is a unit weight (every node an equal slot) and
// its r extent is its reverse depth as a weight; the coord fits both, so the
// ring closes and the tallest wedge reaches from the rim to the 0.72 hub.
//
// NOTES:
//  - StartAngle 0.01 turns: `Coord.clock()` starts at 12 o'clock, which the
//    reference also reads as (its root sits just before 12).
//  - Link is "none" in the dsl (a clock face has no connecting edges).
const meta: Meta = { title: "GoTree / Gallery / ClockTree" };
export default meta;

// A moderately bushy tree so the rim is densely populated (like the reference,
// ~30 wedges of varying depth-color).
const clockTree = {
  name: "root",
  children: [
    { name: "A", children: [{ name: "A1" }, { name: "A2" }, { name: "A3" }] },
    {
      name: "B",
      children: [
        { name: "B1" },
        {
          name: "B2",
          children: [{ name: "B2a" }, { name: "B2b" }, { name: "B2c" }],
        },
        { name: "B3" },
      ],
    },
    { name: "C", children: [{ name: "C1" }, { name: "C2" }] },
    {
      name: "D",
      children: [
        { name: "D1" },
        { name: "D2", children: [{ name: "D2a" }, { name: "D2b" }] },
        { name: "D3" },
        { name: "D4" },
      ],
    },
    { name: "E", children: [{ name: "E1" }, { name: "E2" }, { name: "E3" }] },
  ],
};

const LEVELS = 4; // root + 3 levels (B2's and D2's children are depth 3)

// Wedge node: `w` (the θ extent) is a unit angular weight (every node an equal
// slot) and `h` (the r extent) is its reverse depth, a radial weight.
const node = (d: any) =>
  rect({
    w: datum(1),
    h: datum(LEVELS - d.depth),
    fill: byDepth()(d),
    stroke: "white",
    strokeWidth: 1.5,
  });

export const ClockTree: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: "none",
        parentChild: combine({
          // θ: the child group, then the parent (bottom-up), in adjacent slots.
          x: { kind: "distribute", spacing: 0, order: "reverse" },
          // r: parent and group share the outer rim.
          y: { kind: "align", alignment: "end" },
        }),
        sibling: combine({
          // θ: siblings tile angularly (edge mode sums θ-widths).
          x: { kind: "distribute", spacing: 0 },
          // r: siblings share the outer rim.
          y: { kind: "align", alignment: "end" },
        }),
        // InnerRadius:0.72 — the hollow clock rim (nodes live in the outer band,
        // the disc is empty from the center out to 0.72·R). Now expressible.
        coord: Coord.clock({ innerRadius: 0.72 }),
      },
      { w: 540, h: 540 },
      clockTree
    ),
};
