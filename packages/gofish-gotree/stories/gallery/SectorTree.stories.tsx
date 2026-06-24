import type { Meta, StoryObj } from "@storybook/html";
import { rect, polar, datum } from "gofish-graphics";
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
//   - parentChild: nest θ realizes the dsl's X.Root = include (parent's arc spans
//     its children's; nest grows the unsized parent θ). On the radial axis the
//     port diverges from the dsl's literal Y.Root = within (→align r): aligning r
//     would collapse the tree to one ring. The reference's concentric rings come
//     from GoTree's `RootHeight: rdepth` radius-by-depth encoding, which polar()
//     cannot express, so we use distribute-r (parent inner ring, child group one
//     ring out) to realize them.
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
//  - Angular AUTO-FIT (#618): leaves carry a unit thetaSize weight, nest-θ grows
//    parents to their children's arc, and the coord fits the summed weights to
//    the circle — so the rings close for any tree with no hand-set leafTheta.
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

const RING_THICKNESS = 3; // thin radial band (approximates StaticThickness 2)
const RING_GAP = 13; // radial gap between consecutive rings

// Wedge node (θ auto-fit, #618): leaves carry a unit angular weight; internal
// nodes leave θ unsized so nest-θ grows each to its children's combined arc. The
// coord fits the summed leaf weights to the circle. h (emY) is the thin ring.
const node = (d: any) =>
  d.height === 0
    ? rect({
        thetaSize: datum(1),
        h: RING_THICKNESS,
        emX: true,
        emY: true,
        fill: byDepth(sectorBlues)(d),
        stroke: "#2f78b8",
        strokeWidth: 0.75,
      })
    : rect({
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
        // parentChild: nest θ (include → parent's arc spans its children's;
        // nest grows the unsized parent θ) + distribute r (parent inner ring →
        // child group one ring out, gap = RING_GAP).
        parentChild: combine({
          x: { kind: "nest", pad: 0 },
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
