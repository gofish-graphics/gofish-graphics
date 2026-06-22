import type { Meta, StoryObj } from "@storybook/html";
import { rect, polar } from "gofish-graphics";
import { combine, byDepth, mount, sampleTree } from "./_shared";

// GoTree gallery port — icicleplot (POLAR icicle = concentric wedge bands).
//
// dsl.json: CoordinateSystem.Category = "polar" (PolarAxis y-axis, InnerRadius 0)
// over Layout:
//   X.Root = include      → parentChild θ : parent SPANS its children's angular extent
//   X.Subtree = flatten   → sibling θ     : distribute siblings around the circle
//   Y.Root = juxtapose     → parentChild r : adjacent radial bands (one ring per depth)
//   Y.Subtree = align      → sibling r     : siblings share a radial band
//
// Under polar(): x = θ (radians, 0..2π), y = r (radius). So parentChild nests on
// θ + distributes on r; siblings distribute on θ + align on r. This is the same
// point in the combine({x,y}) space as the Sunburst template in
// ../../stories/Tree.stories.tsx — an icicle and a sunburst are the same layout,
// just cartesian vs. polar.
//
// dsl Node="circle" but the gallery reference renders FILLED WEDGES, so each node
// is a polar wedge (rect swept through θ), per the brief.
//
// ── EMBEDDED-DIMENSION APPROACH (the hard part) ──────────────────────────────
// A wedge SWEEPS in θ, so the θ-dimension is *embedded* in the node's width:
//   w = d.width * leafTheta   with emX:true   (d.width = leaf count from d3-hierarchy)
//   h = bandHeight            with emY:true   (radial ring thickness)
// emX/emY tell gofish the rect's width/height are measured in the transform's
// DOMAIN units (radians for θ, r-units for r), not pixels — so the rect renders
// as an annular wedge once polar() maps it.
//
// Because every node's angular width is its leaf-count share (leafTheta =
// 2π / totalLeaves), a parent's width equals the sum of its children's widths
// automatically. That embedded width — NOT a nest constraint — is what realizes
// the dsl's "include" (parentChild-θ) relation: the parent wedge spans exactly
// its children's combined angular extent. With the embedded width carrying the
// span, the actual θ placement only needs distribute (siblings) + align
// (parent over subtree), which combine() emits. This split — span encoded in the
// mark's embedded dimension, placement in the layout constraints — is the
// subtle bit: get the leaf-count math wrong and the rings stop lining up.
//
// ── POLAR LIMITATIONS (no hacks; flagged, not faked) ─────────────────────────
//  - polar() takes NO options: InnerRadius=0, Direction=clockwise, CentralAngle,
//    StartAngle, and PolarAxis (the θ/r swap) from the dsl are NOT expressible.
//    The plot always fills the full 2π disc from r=0.
//  - NO angular auto-fit: there is no leaf-count allocation pass, so the total
//    angular extent is hand-budgeted via leafTheta = 2π / totalLeaves. If that
//    sum drifts from 2π the wedges overflow and wrap. Here the sample tree's
//    leaf count is computed so each ring sums to exactly 2π.
//  - Links="curve" is unsupported under polar; filled wedges want no links
//    anyway, so link:"none".
const meta: Meta = {
  title: "GoTree / Gallery / icicleplot",
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Polar Icicle",
      description:
        "A polar icicle plot rendering each level as a ring of arc segments sized by subtree.",
    },
  },
};
export default meta;

// Sequential blue ramp matching the dsl ColorRange (#2171b5 dark → #deebf7 light),
// dark at the root, lightening outward by depth.
const icicleBlues = ["#2171b5", "#6baed6", "#9ecae1", "#c6dbef", "#deebf7"];

// totalLeaves drives the angular budget so every ring sums to exactly 2π.
// sampleTree: A(3) + B(B1, B2a, B2b = 3) + C(2) = 8 leaves.
const totalLeaves = 8;
const leafTheta = (2 * Math.PI) / totalLeaves; // angular share of one leaf
const bandHeight = 46; // radial thickness of one depth ring

const node = (d: any) =>
  rect({
    // θ-dimension embedded: width = this node's leaf-count share of the circle.
    w: d.width * leafTheta,
    emX: true,
    // r-dimension embedded: one ring's radial thickness.
    h: bandHeight,
    emY: true,
    fill: byDepth(icicleBlues)(d),
    stroke: "white",
    strokeWidth: 2,
  });

export const IciclePlot: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: "none",
        // parentChild: distribute r (juxtapose → adjacent rings, parent inner →
        // children outward) + align θ middle (parent centered over its subtree;
        // the embedded width already gives it the subtree's full angular span).
        parentChild: combine({
          x: { kind: "align", alignment: "middle" },
          y: { kind: "distribute", spacing: 0 },
        }),
        // sibling: distribute θ (flatten → pack around the circle) + align r
        // middle (siblings share one ring).
        sibling: combine({
          x: { kind: "distribute", spacing: 0 },
          y: { kind: "align", alignment: "middle" },
        }),
        coord: polar(),
      },
      { w: 560, h: 560 },
      sampleTree
    ),
};
