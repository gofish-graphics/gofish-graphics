import type { Meta, StoryObj } from "@storybook/html";
import { rect, datum, Coord, Curve } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — ClockTreeWithLink (a clock-face ring of nodes whose
// links bend inward across the disc).
// dsl: Element{Node:rectangle, Color:depth, Link:curveStepBefore} ;
//   CoordinateSystem polar {InnerRadius:0.79} ;
//   Layout bottom-up  X{Root:juxtapose, Subtree:flatten}
//                     Y{Root:within(bottom), Subtree:align(bottom)}.
//   Element also has RootHeight:rdepth.
//
// MAPPING. Under polar(): x = θ, y = r. The layout is ClockTree's:
//   parentChild = (distribute θ, align r) ; sibling = (distribute θ, align r)
//   Every node gets its own angular slot on one ring. Mode bottom-up puts a
//   parent AFTER its children (the parentChild distribute runs in reverse), and
//   Y within/align bottom sits every node on the OUTER rim ("end" on r), growing
//   inward by its reverse depth (RootHeight: rdepth).
//
// SIZES. A unit θ weight per node and the reverse depth as a radial weight; the
// coord fits both, so the ring closes and the root reaches the 0.79 hub.
//
// NOTES:
//  - Link: curveStepBefore. GoTree draws each link as a step in SCREEN space
//    (a vertical trunk under the root and horizontal branches across the hub).
//    GoFish draws a link inside the coord, so it is warped with the space; there
//    is no way to ask for a link drawn straight on the screen between two
//    warped anchors. The links are linear chords, and each runs between
//    neighboring wedges, so they are mostly hidden.
const meta: Meta = { title: "GoTree / Gallery / ClockTreeWithLink" };
export default meta;

// A moderate uneven tree (3 levels) so the ring shows a mix of depths/colors,
// like the reference's interleaved light/dark arc segments.
const branch = (p: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `${p}${i}` }));
const clockData = {
  name: "root",
  children: [
    { name: "a", children: branch("a", 3) },
    { name: "b", children: branch("b", 2) },
    { name: "c", children: branch("c", 4) },
    { name: "d", children: branch("d", 1) },
    { name: "e", children: branch("e", 3) },
    { name: "f", children: branch("f", 2) },
    { name: "g", children: branch("g", 3) },
    { name: "h", children: branch("h", 2) },
  ],
};

const LEVELS = 3; // root + 2 levels

// Rectangle node: `w` (the θ extent) is a unit angular weight (every node an
// equal slot) and `h` (the r extent) its reverse depth, a radial weight.
// Colored by depth (dark root → light leaves).
const node = (d: any) =>
  rect({
    w: datum(1),
    h: datum(LEVELS - d.depth),
    fill: byDepth()(d),
    stroke: "white",
    strokeWidth: 1.5,
  });

export const ClockTreeWithLink: StoryObj = {
  render: () =>
    mount(
      {
        node,
        // curveStepBefore is unsupported → straight chord (bows under polar).
        link: { curve: Curve.linear(), stroke: "#90a4ae", strokeWidth: 1 },
        parentChild: combine({
          // θ: the child group, then the parent (bottom-up), in adjacent slots.
          x: { kind: "distribute", spacing: 0, order: "reverse" },
          // r: parent and subtree share the outer rim.
          y: { kind: "align", alignment: "end" },
        }),
        sibling: combine({
          // θ: siblings tile angularly (edge mode sums θ-widths).
          x: { kind: "distribute", spacing: 0 },
          // r: siblings share the outer rim.
          y: { kind: "align", alignment: "end" },
        }),
        // InnerRadius:0.79 — the thin outer clock rim with an empty center.
        coord: Coord.clock({ innerRadius: 0.79 }),
      },
      { w: 520, h: 520 },
      clockData
    ),
};
