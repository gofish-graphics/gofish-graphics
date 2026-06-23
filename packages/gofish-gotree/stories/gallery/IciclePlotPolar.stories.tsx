import type { Meta, StoryObj } from "@storybook/html";
import { rect, polar, datum } from "gofish-graphics";
import { tree, combine } from "../../src";
import { byDepth, sampleTree } from "../data";
import { initializeContainer } from "../helper";

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
// A wedge SWEEPS in θ, so the θ-dimension is *embedded* (emX) and the radial band
// is *embedded* in h (emY), so once polar() maps it the rect renders as an
// annular wedge.
//
// The dsl's "include" (X.Root) — parent SPANS its children's angular extent — is
// realized by `nest` on θ (the proper containment primitive): the parent leaves
// θ unsized and nest grows it to its children's combined arc. Leaves carry a unit
// `thetaSize` weight; the coord is the σ-scale-root, summing the weights and
// fitting them to the circle (#618), so every ring closes for any tree with no
// hand-set leafTheta. (Earlier this used align-θ + a hand `d.width·leafTheta`
// width as a workaround; `include → nest` + auto-fit renders identically and is
// the principled spelling.)
//
// ── POLAR LIMITATIONS (no hacks; flagged, not faked) ─────────────────────────
//  - polar() InnerRadius/Direction/StartAngle/PolarAxis (the θ/r swap) from the
//    dsl are not all expressible here; the plot fills the full 2π disc.
//  - The radial bands start at r=band (distribute-r), leaving a hollow center the
//    dsl's InnerRadius:0 doesn't want — a separate radial-placement gap (shared
//    with SectorTree2/HSC), unrelated to the angular auto-fit.
//  - Links="curve" is unsupported under polar; filled wedges want no links
//    anyway, so link:"none".
const meta: Meta = {
  title: "GoTree / Gallery / icicleplot",
};
export default meta;

// Sequential blue ramp matching the dsl ColorRange (#2171b5 dark → #deebf7 light),
// dark at the root, lightening outward by depth.
const icicleBlues = ["#2171b5", "#6baed6", "#9ecae1", "#c6dbef", "#deebf7"];

// sampleTree: A(3) + B(B1, B2a, B2b = 3) + C(2) = 8 leaves.
const bandHeight = 46; // radial thickness of one depth ring

// θ auto-fit (#618): leaves carry a unit angular weight; internal nodes leave θ
// unsized so nest-θ grows each to its children's combined arc. The coord fits the
// summed leaf weights to the circle. Ragged outer edge (shallow branches stop
// early) is correct for an unbalanced icicle.
const node = (d: any) =>
  d.height === 0
    ? rect({
        thetaSize: datum(1),
        emX: true,
        h: bandHeight,
        emY: true,
        fill: byDepth(icicleBlues)(d),
        stroke: "white",
        strokeWidth: 2,
      })
    : rect({
        emX: true,
        h: bandHeight,
        emY: true,
        fill: byDepth(icicleBlues)(d),
        stroke: "white",
        strokeWidth: 2,
      });

export const IciclePlot: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Polar Icicle",
      description:
        "A polar icicle plot rendering each level as a ring of arc segments sized by subtree.",
    },
  },
  render: () => {
    const container = initializeContainer({ w: 560, h: 560 });
    tree(
      {
        node,
        link: "none",
        // parentChild: distribute r (juxtapose → adjacent rings, parent inner →
        // children outward) + align θ middle (parent centered over its subtree;
        // the embedded width already gives it the subtree's full angular span).
        parentChild: combine({
          x: { kind: "nest", pad: 0 },
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
      sampleTree
    ).render(container, { w: 560, h: 560 });
    return container;
  },
};
