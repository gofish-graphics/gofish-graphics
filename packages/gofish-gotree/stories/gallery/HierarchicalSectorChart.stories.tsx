import type { Meta, StoryObj } from "@storybook/html";
import { rect, datum, Coord } from "gofish-graphics";
import { tree, combine } from "../../src";
import { byDepth } from "../data";
import { initializeContainer } from "../helper";

// GoTree gallery port — HierarchicalSectorChart (sunburst-of-sectors: concentric
// filled rect wedges, color ramped by depth).
// dsl: Element{Node:rectangle, Color:depth, Link:hidden,
//             ColorRange:["#DE4006","#EFD648"]} ;
//      CoordinateSystem{Category:polar} ;
//      Layout{Category:AxisIndependent,
//             X{Root:{include}, Subtree:{flatten}},
//             Y{Root:{juxtapose}, Subtree:{align}}, Mode:top-down}.
//
// MAPPING. Under polar(): x = θ (radians 0..2π), y = r (radius). Brief mapping:
//   parentChild = (nest θ, distribute r)
//     - nest on θ (X.Root:include → nest): the parent wedge spans the combined
//       angular extent of its children. pad 0 → no angular gap, so the parent's
//       arc exactly covers its subtree's arc — the sector-ring relationship.
//     - distribute on r (Y.Root:juxtapose → distribute): parent sits on the
//       inner ring, the child group on the next ring out, with no gap.
//   sibling = (distribute θ, align r)
//     - distribute on θ (X.Subtree:flatten → distribute): siblings pack
//       angularly, edge mode so each wedge's θ weight is summed → they tile
//       their parent's arc.
//     - align on r (Y.Subtree:align → align "start"): GoTree aligns the
//       sibling nodes, so siblings start on the same ring.
//
// SIZES. Leaves carry a unit θ weight and internal nodes none (nest grows each
// to its children's arc); every node carries a radial weight, its ring count
// (`rings` below). The coord fits both to the room, so the root is a solid
// disc and the outer ring meets the rim.
//
// NOTES:
//  - Link:hidden → link:"none" here (correct for a filled-wedge sector chart).
//  - Node:rectangle in the dsl renders, faithfully, as filled arc wedges (a
//    rect in polar space IS a sector), matching the reference.
//  - The reference's data has depth-1 leaves, which GoTree stretches out to
//    the rim; this tree has none, so that case is not shown.
//  - ColorRange ["#DE4006","#EFD648"] (orange→yellow by depth) is reproduced by
//    a hand-sampled per-depth ramp passed to byDepth(); polar()/the color scale
//    take no interpolated-range option here, so the ramp stops are explicit.

const meta: Meta = {
  title: "GoTree / Gallery / HierarchicalSectorChart",
};
export default meta;

// Orange→yellow depth ramp (dsl ColorRange ["#DE4006","#EFD648"]), sampled at
// the depths this 3-level tree uses: 0 = root disc, 1 = inner ring, 2 = leaves.
const sectorRamp = ["#DE4006", "#E87B11", "#EFD648"];

// Moderately uneven 3-level tree (matching the reference's varying sector
// subdivision: some depth-1 sectors split into many depth-2 wedges, some few).
const sectorTree = {
  name: "root",
  children: [
    { name: "A", children: [{ name: "A1" }, { name: "A2" }, { name: "A3" }] },
    { name: "B", children: [{ name: "B1" }, { name: "B2" }] },
    {
      name: "C",
      children: [
        { name: "C1" },
        { name: "C2" },
        { name: "C3" },
        { name: "C4" },
      ],
    },
    { name: "D", children: [{ name: "D1" }, { name: "D2" }] },
    { name: "E", children: [{ name: "E1" }, { name: "E2" }, { name: "E3" }] },
  ],
};

// A node's ring thickness, in leaf rings. GoTree sizes a parent on the
// juxtapose axis like its child group ("SubtreeHeight: adaptive"), so a leaf
// is one ring, a parent of leaves one ring, and each level above doubles: the
// root disc is as thick as the two rings around it.
const rings = (d: any) => (d.height === 0 ? 1 : 2 ** (d.height - 1));

// Wedge node: width is a θ weight that sweeps an arc; height is a radial
// weight. The coord fits both to the room. Leaves carry the θ weight; internal
// nodes leave width to nest (grows to children's combined arc).
const node = (d: any) =>
  d.height === 0
    ? rect({
        w: datum(1),
        h: datum(rings(d)),
        fill: byDepth(sectorRamp)(d),
        stroke: "white",
        strokeWidth: 1.5,
      })
    : rect({
        h: datum(rings(d)),
        fill: byDepth(sectorRamp)(d),
        stroke: "white",
        strokeWidth: 1.5,
      });

export const HierarchicalSectorChart: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Hierarchical Sector Chart",
      description:
        "A hierarchical sector chart drawing the tree as concentric polar wedges sized by subtree.",
    },
  },
  render: () => {
    const container = initializeContainer();
    tree(
      {
        node,
        link: "none",
        parentChild: combine({
          // θ: parent wedge encloses its subtree's arc (pad 0 → exact tiling).
          x: { kind: "nest", pad: 0 },
          // r: parent inner ring, child group on the next ring out (edge mode,
          // spacing 0 → child band starts exactly at the parent band's outer
          // edge, so rings touch with no radial gap).
          y: { kind: "distribute", spacing: 0 },
        }),
        sibling: combine({
          // θ: siblings tile their parent's arc (edge mode sums θ-widths).
          x: { kind: "distribute", spacing: 0 },
          // r: siblings start on the same ring (their inner edges align).
          y: { kind: "align", alignment: "start" },
        }),
        coord: Coord.clock(),
      },
      sectorTree
    ).render(container, { w: 540, h: 540 });
    return container;
  },
};
