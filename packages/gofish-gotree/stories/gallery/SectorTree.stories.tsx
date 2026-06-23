import type { Meta, StoryObj } from "@storybook/html";
import { rect, polar } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — SectorTree (concentric rings of thin sector wedges).
//
// dsl.json:
//   Layout AxisIndependent, bottom-up
//     X { Root: juxtapose (→distribute),  Subtree: flatten (→distribute) }
//     Y { Root: within    (→align),       Subtree: align   (→align)     }
//   CoordinateSystem { Category: polar, PolarAxis: x-axis, PolarCenter: right }
//   Element { Node: rectangle, Color: depth, Link: none,
//             RootHeight: rdepth, Thickness: static (StaticThickness 2),
//             ArcDirection: top }
//
// VISUAL TARGET (gallery/SectorTree/tree.png): thin (≈2px) concentric arc rings
// emanating from a center, one ring per tree depth, leaves fanning angularly,
// colored light (center) → blue (outer) by depth.
//
// ── MAPPING. Under polar(): x = θ (radians 0..2π), y = r (radius). ───────────
// A sector wedge SWEEPS through θ, so the θ-dimension is EMBEDDED in the node's
// width (emX:true, measured in radians); the radial thickness is its height
// (emY:true, measured in r-units). Same embedded-wedge technique as the
// Sunburst / IciclePlot(polar) templates.
//   - sibling = (distribute θ, align r): siblings pack angularly into their
//     parent's arc (X.Subtree flatten → distribute) and share one radial ring
//     (Y.Subtree align → align). This is the dsl mapping verbatim.
//   - parentChild: here the port DELIBERATELY DIVERGES from the dsl's literal
//     Y.Root = within (→align r). See the NOTES block — aligning r would put
//     parent and children on the SAME ring and collapse the whole tree to a
//     single ring, which is NOT the reference. The reference's concentric rings
//     come from GoTree's `RootHeight: rdepth` radius-by-depth encoding, which
//     GoFish polar() cannot express. To honor the reference (concentric rings)
//     the only renderable realization is distribute-r for parentChild (parent on
//     the inner ring, child group one ring out), with align-θ centering the
//     parent over its subtree (the embedded width already gives it the subtree's
//     full angular span). X.Root juxtapose (→distribute) is kept on the radial
//     axis; it is the angular axis where the divergence lives.
//
// ── NOTES — dsl features GoFish's polar() CANNOT express ──
//    (no options, no hacks; flagged, not faked):
//  - PolarAxis: x-axis (the θ/r axis swap) is NOT expressible: polar() has no
//    transposed variant — it always maps x→θ, y→r ([r·sinθ, r·cosθ]). So the
//    PolarAxis choice can't be honored; I use polar().
//  - PolarCenter: right and the partial (≈270°) sweep of the reference are not
//    expressible — polar() always fills the full 2π disc, centered, fixed start
//    angle. This port renders a FULL concentric-ring disc, not the reference's
//    off-center partial fan.
//  - RootHeight: rdepth — radius-driven-by-depth is not a knob; concentric rings
//    are realized via distribute-r (see MAPPING divergence above).
//  - Thickness: static / StaticThickness 2 — there is no per-node static-pixel
//    radial-thickness knob under polar (thickness is the emY band height in
//    r-units). I approximate thin rings with a small band height + a radial gap.
//  - InnerRadius / Direction / StartAngle / CentralAngle: polar() takes NO
//    options, so the hollow-center inner radius, CW/CCW direction, start angle,
//    and sub-2π central angle are all unavailable.
//  - NO angular auto-fit: GoTree allocates angle by subtree leaf count; GoFish
//    has no such pass, so the angular budget is HAND-SET via
//    leafTheta = 2π / totalLeaves and summed by the embedded leaf widths. An
//    unbalanced tree or a wrong leafTheta overflows 2π and the wedges wrap.
//  - Link: none — correct for filled wedges; matches the dsl.
const meta: Meta = { title: "GoTree / Gallery / SectorTree" };
export default meta;

// Light (center) → blue (outer), so depth 0 (root, inner ring) is faintest and
// deeper rings darken outward — matching the reference's ramp.
const sectorBlues = [
  "#eff6fb",
  "#d6e7f3",
  "#b6d4ea",
  "#8fbfe0",
  "#6aa8d6",
  "#4a90c8",
  "#2f78b8",
];

// Balanced binary tree, 6 levels deep → 64 leaves, so wedge widths divide the
// disc evenly (each internal node has exactly 2 children) and the concentric
// rings (one per depth) read clearly.
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
  return make(6);
})();

const LEAF_COUNT = 64; // 2^6
const leafTheta = (2 * Math.PI) / LEAF_COUNT; // each leaf's angular share
const RING_THICKNESS = 3; // thin radial band (approximates StaticThickness 2)
const RING_GAP = 13; // radial gap between consecutive rings

// Wedge node: width in θ-units (emX) sweeps an arc whose extent is the node's
// leaf-count share; height in r-units (emY) is the thin ring thickness.
const node = (d: any) =>
  rect({
    w: d.width * leafTheta,
    h: RING_THICKNESS,
    emX: true,
    emY: true,
    fill: byDepth(sectorBlues)(d),
    stroke: "#2f78b8",
    strokeWidth: 0.75,
  });

export const SectorTree: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: "none",
        // parentChild: distribute r (parent inner ring → child group one ring
        // out, gap = RING_GAP) + align θ middle (parent centered over its
        // subtree; the embedded width already supplies the angular span).
        parentChild: combine({
          x: { kind: "align", alignment: "middle" },
          y: { kind: "distribute", spacing: RING_GAP, mode: "edge" },
        }),
        // sibling: distribute θ (pack angularly into the parent's arc) +
        // align r middle (siblings share one ring).
        sibling: combine({
          x: { kind: "distribute", spacing: 0, mode: "edge" },
          y: { kind: "align", alignment: "middle" },
        }),
        coord: polar(),
      },
      { w: 560, h: 560 },
      deepBalancedTree
    ),
};
