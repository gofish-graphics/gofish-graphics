import type { Meta, StoryObj } from "@storybook/html";
import { rect, datum, Coord } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — SectorTree (one thin arc per node, all centered on the
// bottom of the disc, the root the outer full circle).
//
// dsl.json:
//   Layout AxisIndependent, bottom-up
//     X { Root: juxtapose (→distribute),  Subtree: flatten (→distribute) }
//     Y { Root: within    (→align),       Subtree: align   (→align)     }
//   CoordinateSystem { Category: polar, PolarAxis: x-axis, PolarCenter: right }
//   Element { Node: rectangle, Color: depth, RootHeight: rdepth }
//
// PolarAxis: x-axis puts the layout's X on the RADIUS and its Y on the ANGLE.
// GoFish's polar always reads x as θ and y as r, so the port writes the X
// relations on `y` and the Y relations on `x`:
//   - r (dsl X): every node gets its own radius. Parent and child group are
//     juxtaposed, bottom-up, so the parent lies OUTSIDE its children (the
//     parentChild distribute runs in reverse), and siblings are flattened
//     outward one after another. The root is the outermost arc.
//   - θ (dsl Y): every node is centered on the same angle ("within"/"align"
//     middle), the bottom of the disc, and its angular extent is its reverse
//     depth (RootHeight: rdepth): the root is the whole circle, a depth-1 node
//     two thirds of it, a leaf one third.
//
// SIZES. Each node's θ extent is its reverse depth and its r extent one unit,
// both as weights; the coord fits them, so the root closes into the rim.
//
// NOTES:
//  - PolarCenter: right decides which end of the X axis is the pole; the
//    reference has the root on the rim, which the reverse order gives.
//  - Link: none — matches the dsl.
const meta: Meta = { title: "GoTree / Gallery / SectorTree" };
export default meta;

// Light (leaves) → blue (root), the reference's ramp.
const sectorBlues = ["#2171b5", "#84aed8", "#deebf7"];

// A three-level tree with uneven fan-out, like the reference.
const branch = (p: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `${p}${i}` }));
const sectorTree = {
  name: "root",
  children: [
    { name: "a", children: branch("a", 3) },
    { name: "b" },
    { name: "c", children: branch("c", 4) },
    { name: "d", children: branch("d", 2) },
    { name: "e" },
    { name: "f", children: branch("f", 3) },
    { name: "g", children: branch("g", 1) },
    { name: "h", children: branch("h", 4) },
  ],
};
const LEVELS = 3; // root + 2 levels

// Thin arc: θ extent = reverse depth, r extent = one unit.
const node = (d: any) =>
  rect({
    w: datum(LEVELS - d.depth),
    h: datum(1),
    fill: byDepth(sectorBlues)(d),
    stroke: "white",
    strokeWidth: 1,
  });

export const SectorTree: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: "none",
        // parentChild: r — the child group, then the parent outside it
        // (juxtapose, bottom-up); θ — the child group centered within the
        // parent's arc.
        parentChild: combine({
          x: { kind: "align", alignment: "middle" },
          y: { kind: "distribute", spacing: 0, order: "reverse" },
        }),
        // sibling: r — flattened outward one after another; θ — centered on
        // the same angle.
        sibling: combine({
          x: { kind: "align", alignment: "middle" },
          y: { kind: "distribute", spacing: 0 },
        }),
        coord: Coord.clock(),
      },
      { w: 540, h: 540 },
      sectorTree
    ),
};
