import type { Meta, StoryObj } from "@storybook/html";
import { rect, polar } from "gofish-graphics";
import { tree, combine } from "../../src";
import { byDepth } from "../data";
import { initializeContainer } from "../helper";

// GoTree gallery port — SectorTree2 (concentric filled sector/wedge rings).
// dsl: Element{Node:rectangle, Color:depth, Link:curve, Thickness:static 2} ;
//   CoordinateSystem polar {PolarAxis:x-axis, PolarCenter:right} ;
//   Layout AxisIndependent X{Root:include, Subtree:flatten}
//                          Y{Root:juxtapose, Subtree:align}, Mode:top-down.
//
// MAPPING. Under polar(): x = θ (radians 0..2π), y = r (radius). Per the brief
// (x=θ, y=r):
//   parentChild = (nest θ, distribute r)
//     - nest on θ: X.Root:include → nest. The parent wedge spans the combined
//       angular extent of its children (pad 0 → no gap, so the parent's arc
//       exactly covers its subtree's arc — the ring/sector relationship).
//     - distribute on r: Y.Root:juxtapose → distribute. Parent on the inner
//       ring, child group one ring out; spacing = ring (band) thickness.
//   sibling = (distribute θ, align r)
//     - distribute on θ: X.Subtree:flatten → distribute. Siblings pack
//       angularly (edge mode sums their θ-widths) so they tile the parent arc.
//     - align on r: Y.Subtree:align → align. Siblings share one ring.
// This is the identical axis decomposition to the gallery Sunburst; SectorTree2
// is GoTree's "rectangle node + curve link, depth color" point in that same
// polar layout space.
//
// EMBEDDED-DIMENSION WEDGE. A sector wedge SWEEPS through θ, so the node's
// θ-dimension is EMBEDDED in the polar transform: the rect WIDTH is measured in
// θ-units (radians, emX:true) so it sweeps an arc rather than a flat pixel span;
// its r-dimension (height, emY:true) is the ring thickness. Hard "embedded vs
// non-embedded" case:
//   - LEAVES carry an explicit θ-width = leafTheta (their angular share).
//   - INTERNAL nodes get NO width — nest grows the parent's θ-width to its
//     children's combined extent.
// Because nest sums leaf widths up the tree and leaves tile exactly, the total
// angular extent equals the 2π budget: N_leaves * leafTheta = 2π.
//
// NOTES — dsl features that gofish's polar() CANNOT express (flagged, not faked;
// polar() takes NO options):
//  - PolarAxis: x-axis — the dsl pins the angular axis to screen-x with the
//    center on the right (PolarCenter:right), giving the reference its
//    "solid root half-disc on the left, rings fanning right" look. polar()
//    has fixed orientation and a fixed center; this re-orientation is NOT
//    expressible. A θ/r axis swap would map x→r, y→θ, which
//    inverts our decomposition (nest would grow radius, distribute would
//    spin angle) and destroys the concentric-ring structure — so polar() is
//    the closer match and is what's used here. The cost is orientation: we
//    get a full upright disc, not the right-centered half-disc of the
//    reference.
//  - PolarCenter: right — no center-placement knob; the disc is centered.
//  - InnerRadius: there is no inner-radius origin knob, so the root band
//    starts at r = bandHeight (a small hollow center), not at r = 0.
//  - Link:curve — links are not drawn for filled sector wedges (link:"none"
//    is correct here); polar links only support {interpolation:"linear"|"none"},
//    never curved arcs, so the dsl's curve links are not representable anyway.
//  - Thickness:static 2 maps to the wedge stroke width.
//  - NO angular auto-fit: the layout engine does NOT allocate θ by subtree
//    leaf-count. It tiles here only because leaf widths are hand-set to
//    leafTheta and summed by nest; an unbalanced tree or a wrong leafTheta
//    overflows 2π and wedges wrap. GoTree allocates angle automatically.
const meta: Meta = {
  title: "GoTree / Gallery / SectorTree2",
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

const LEAF_COUNT = 16; // 2^4
const leafTheta = (2 * Math.PI) / LEAF_COUNT; // each leaf's angular share
const bandHeight = 42; // radial thickness of one ring

// Wedge node: width in θ-units (emX) sweeps an arc; height in r-units (emY) is
// the ring thickness. Leaves carry the explicit θ-share; internal nodes leave
// width to nest (grows to children's combined arc). Color by depth (blue ramp,
// dark root → light leaves), matching the reference. Static thickness-2 stroke.
const node = (d: any) =>
  d.height === 0
    ? rect({
        w: leafTheta,
        h: bandHeight,
        emX: true,
        emY: true,
        fill: byDepth()(d),
        stroke: "white",
        strokeWidth: 2,
      })
    : rect({
        h: bandHeight,
        emX: true,
        emY: true,
        fill: byDepth()(d),
        stroke: "white",
        strokeWidth: 2,
      });

export const SectorTree2: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Sector Tree",
      description:
        "A polar sector tree nesting child wedges within parent arcs across radial levels.",
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
