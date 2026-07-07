import type { Meta, StoryObj } from "@storybook/html";
import { rect, polar, datum } from "gofish-graphics";
import { tree, combine } from "../../src";
import { byDepth } from "../data";
import { initializeContainer } from "../helper";

// GoTree gallery port — sunburst (concentric filled wedges).
// dsl: Element{Node:circle, Color:depth, Link:curve} ; CoordinateSystem polar
//   {Direction:clockwise, PolarAxis:y-axis, InnerRadius:0, StartAngle:0} ;
//   Layout AxisIndependent X{Root:include, Subtree:flatten}
//                          Y{Root:juxtapose, Subtree:align}.
//
// MAPPING. Under polar(): x = θ (radians 0..2π), y = r (radius). Brief mapping:
//   parentChild = (nest θ, distribute r)
//     - nest on θ: parent wedge spans the combined angular extent of its
//       children (X.Root:include → nest). pad 0 → no angular gap, so the
//       parent's arc exactly covers its subtree's arc — the sunburst ring
//       relationship.
//     - distribute on r: parent sits on the inner ring, the child group on the
//       next ring out (Y.Root:juxtapose → distribute), spacing = ring thickness.
//   sibling = (distribute θ, align r)
//     - distribute on θ: siblings pack angularly, edge mode so each wedge's
//       θ-width (its leaf-count share) is summed → they tile their parent's arc
//       (X.Subtree:flatten → distribute).
//     - align on r: siblings share the same ring (Y.Subtree:align → align).
//
// EMBEDDED-DIMENSION WEDGE. A sunburst wedge SWEEPS through θ, so the node's
// θ-dimension is EMBEDDED in the polar transform: the rect's WIDTH is measured
// in θ-units (radians) with emX:true, so its width sweeps an arc rather than
// being a flat pixel span. Its r-dimension (height, emY:true) is the ring
// thickness. This is the hard "embedded vs non-embedded dimension" case:
//   - LEAVES carry an explicit θ-width = leafTheta (their angular share).
//   - INTERNAL nodes get NO width — nest grows the parent's θ-width to its
//     children's combined extent. Both axes are emY/emX so the rect lives in
//     polar space.
// Because nest sums leaf widths up the tree and the leaves tile exactly, the
// total angular extent works out to the 2π budget: N_leaves * leafTheta = 2π.
//
// NOTES — polar features in the dsl that gofish's polar() CANNOT express
// (no options, no hacks; flagged, not faked):
//  - InnerRadius: 0 is NOT achievable — observe the hollow center. The root
//    ring lands at r ∈ [bandHeight, 2·bandHeight] because the first
//    parentChild distribute step starts the root band at r = bandHeight, not
//    r = 0; polar() has no inner-radius origin knob to pin the root to the
//    center. (The dsl asks for InnerRadius:0 = no hole; we get a hole.)
//  - Direction: clockwise — polar() is fixed-orientation; no CW/CCW swap.
//  - StartAngle / CentralAngle: no start-angle or sub-2π sweep knob; the disc
//    always starts at the same angle and the budget is the full 2π.
//  - PolarAxis: y-axis (the θ/r axis swap from the dsl) is not expressible.
//  - Link:curve — links are not drawn for a filled-wedge sunburst (link:"none"
//    is correct here); polar links only support {interpolation:"linear"|"none"},
//    never curved arcs.
//  - Angular AUTO-FIT (#618): leaves carry a unit `thetaSize` weight; the coord
//    fits the summed weights to the budget and nest grows each parent to its
//    children's combined arc — so the disc closes for any tree with no hand-set
//    leafTheta. (This nest-θ case composes with the coord fit-frame.)
//  - Node:circle in the dsl, but the reference (and a real sunburst) is filled
//    arc wedges — we render rect wedges, matching the visual reference.
const meta: Meta = {
  title: "GoTree / Gallery / sunburst",
};
export default meta;

// Balanced binary tree, 4 levels deep → 16 leaves, so wedge widths divide the
// disc evenly (each internal node has exactly 2 children).
const deepBalancedTree = (() => {
  const make = (depth: number, prefix = ""): any =>
    depth === 0
      ? { name: prefix }
      : {
          name: prefix || "root",
          children: [
            make(depth - 1, prefix + "L"),
            make(depth - 1, prefix + "R"),
          ],
        };
  return make(4);
})();

const bandHeight = 42; // radial thickness of one ring

// Wedge node: leaves carry a unit angular WEIGHT (thetaSize) that the coord sums
// and fits to the budget; internal nodes leave θ unsized so nest grows them to
// their children's combined arc. emX/emY make θ sweep an arc and r the ring
// thickness. No hand-set 2π/N — the ring auto-fits.
const node = (d: any) =>
  d.height === 0
    ? rect({
        thetaSize: datum(1),
        h: bandHeight,
        emX: true,
        emY: true,
        fill: byDepth()(d),
        stroke: "white",
        strokeWidth: 1.5,
      })
    : rect({
        h: bandHeight,
        emX: true,
        emY: true,
        fill: byDepth()(d),
        stroke: "white",
        strokeWidth: 1.5,
      });

export const Sunburst: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Sunburst",
      description:
        "A sunburst diagram drawing the hierarchy as nested arc wedges radiating from the root.",
    },
  },
  render: () => {
    const container = initializeContainer({ w: 540, h: 540 });
    tree(
      {
        node,
        link: "none",
        parentChild: combine({
          // θ: parent wedge encloses its subtree's arc (pad 0 → exact tiling).
          x: { kind: "nest", pad: 0 },
          // r: parent inner ring, child group one ring out.
          y: { kind: "distribute", spacing: bandHeight, mode: "edge" },
        }),
        sibling: combine({
          // θ: siblings tile their parent's arc (edge mode sums θ-widths).
          x: { kind: "distribute", spacing: 0, mode: "edge" },
          // r: siblings share the same ring.
          y: { kind: "align", alignment: "middle" },
        }),
        coord: polar(),
      },
      deepBalancedTree
    ).render(container, { w: 540, h: 540 });
    return container;
  },
};
