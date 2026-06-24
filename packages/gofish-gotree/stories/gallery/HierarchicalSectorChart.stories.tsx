import type { Meta, StoryObj } from "@storybook/html";
import { rect, polar, datum } from "gofish-graphics";
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
//       inner ring, the child group one ring out; spacing = ring thickness.
//   sibling = (distribute θ, align r)
//     - distribute on θ (X.Subtree:flatten → distribute): siblings pack
//       angularly, edge mode so each wedge's θ-width (its leaf-count share) is
//       summed → they tile their parent's arc.
//     - align on r (Y.Subtree:align → align): siblings share the same ring.
//
// EMBEDDED-DIMENSION WEDGE. A sector wedge SWEEPS through θ, so the node's
// θ-dimension is EMBEDDED in the polar transform: the rect's WIDTH is measured
// in θ-units (radians) with emX:true, so its width sweeps an arc rather than a
// flat pixel span. Its r-dimension (height, emY:true) is the ring thickness.
// This is the hard "embedded vs non-embedded dimension" case:
//   - LEAVES carry an explicit θ-width = leafTheta (their angular share).
//   - INTERNAL nodes get NO width — nest grows the parent's θ-width to its
//     children's combined extent. Both axes are em* so the rect lives in polar
//     space. Because nest sums leaf widths up the tree and leaves tile exactly,
//     the total angular extent works out to the 2π budget:
//     N_leaves · leafTheta = 2π.
//
// NOTES — polar features in the dsl that gofish's polar() CANNOT express
// (no options, no hacks; flagged, not faked):
//  - InnerRadius:0 (the reference has a SOLID center disc, no hole) is NOT
//    achievable — observe the hollow center. polar()'s first parentChild
//    distribute step starts the root band at r = bandHeight, not r = 0, and
//    polar() has no inner-radius origin knob to pin the root to the center, so
//    the root renders as a thin ring around a hole instead of a filled disc.
//  - Direction / StartAngle / CentralAngle: polar() is fixed-orientation, fixed
//    start angle, fixed full-2π sweep. The dsl's clockwise / start-angle /
//    sub-2π knobs are not expressible.
//  - PolarAxis (θ/r axis swap) is not expressible.
//  - Link:hidden → link:"none" here (correct for a filled-wedge sector chart);
//    polar links only support {interpolation:"linear"|"none"}, never arcs.
//  - Angular AUTO-FIT (#618): leaves carry a unit thetaSize weight, nest-θ sums
//    them up the tree, and the coord fits the total to the circle — so the disc
//    closes for any tree with no hand-set leafTheta.
//  - Node:rectangle in the dsl renders, faithfully, as filled arc wedges (a
//    rect in polar space IS a sector), matching the reference.
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

const bandHeight = 56; // radial thickness of one ring

// Wedge node: width in θ-units (emX) sweeps an arc; height in r-units (emY) is
// the ring thickness. Leaves carry the explicit θ-share; internal nodes leave
// width to nest (grows to children's combined arc).
const node = (d: any) =>
  d.height === 0
    ? rect({
        thetaSize: datum(1),
        h: bandHeight,
        emX: true,
        emY: true,
        fill: byDepth(sectorRamp)(d),
        stroke: "white",
        strokeWidth: 1.5,
      })
    : rect({
        h: bandHeight,
        emX: true,
        emY: true,
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
    const container = initializeContainer({ w: 560, h: 560 });
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
          y: { kind: "distribute", spacing: 0, mode: "edge" },
        }),
        sibling: combine({
          // θ: siblings tile their parent's arc (edge mode sums θ-widths).
          x: { kind: "distribute", spacing: 0, mode: "edge" },
          // r: siblings share the same ring.
          y: { kind: "align", alignment: "middle" },
        }),
        coord: polar(),
      },
      sectorTree
    ).render(container, { w: 560, h: 560 });
    return container;
  },
};
