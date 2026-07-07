import type { Meta, StoryObj } from "@storybook/html";
import { circle, polar } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — outside-in-tree (radial sunburst-family node-link;
// root toward the OUTSIDE, leaves toward the center).
//
// dsl: Node=circle, Link=curve, Color=depth, ColorRange dark→light blue.
//   CoordinateSystem: polar, PolarAxis y-axis, InnerRadius 0.
//   Layout (X=θ, Y=r under polar — x→θ, y→r):
//     X (θ): Root="include"(nest)   Subtree="flatten"(distribute)
//     Y (r): Root="juxtapose"(distribute)  Subtree="align"
//   ⇒ parentChild = (nest θ, distribute r) ; sibling = (distribute θ, align r).
//
// "outside-in": the root sits at the OUTER radius and the tree grows inward.
// Achieved by reversing the radial (r) distribute order so depth 0 lands at
// the LARGEST r and each deeper level steps toward the center. (Plain
// RadialTree uses forward order: root at center, leaves outward.)
//
// Point-like circle nodes ⇒ mode:"center" on every distribute axis so spacing
// is read in domain units (radians for θ, r-units for r) and bboxes don't
// accumulate around the ring.
//
// NOTES (polar gaps — no hacks, flagged for follow-up):
//  - parentChild θ-relation is "nest" in the dsl (the parent's angular span
//    ENCLOSES its subtree's span — this is what produces the nested-wedge
//    "sunburst" look in the reference render). `combine`'s nest needs a
//    GROWABLE outer mark (an unsized rect with emX/emY, as in NestedPieTree);
//    a point circle has a fixed radius and cannot grow to wrap its children's
//    angular extent. So θ-nest is approximated here with align-middle on θ
//    (the radial node-link convention: parent centered over its subtree's
//    angular span). Switching the node mark to a growable wedge rect would let
//    the literal nest mapping render — but then it is a sunburst, not the
//    circle node-link the dsl's Node=circle calls for.
//  - Link=curve is not supported; links render as straight segments
//    ({interpolation:"linear"}) which in polar appear as chords, not arcs (the
//    route→curve link API lands in draft PR #637).
//  - No angular auto-fit for POINT nodes: angular spacing is a fixed per-level
//    constant and does NOT shrink with the node count at a depth, so wide levels
//    overflow the 2π budget and wedges wrap. GoTree allocates angle by subtree
//    leaf-count. Wedge (rect) nodes now auto-fit via thetaSize since #622; this
//    point/circle-node gap is tracked in #627 (data-position workaround shown in
//    RadialDeep.stories.tsx).
//  - polar() now takes options — { innerRadius, centralAngle, startAngle,
//    direction, center } since #620 — so InnerRadius (0), Direction (clockwise),
//    CentralAngle and StartAngle are now expressible via polar({ ... }) since
//    #620 (not yet applied here). The PolarAxis θ/r swap is still NOT
//    expressible.
const meta: Meta = { title: "GoTree / Gallery / outside-in-tree" };
export default meta;

const node = (d: any) =>
  circle({ r: 7, fill: byDepth()(d), stroke: "#1f3a5f", strokeWidth: 1 });

export const OutsideInTree: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: { interpolation: "linear", stroke: "#90a4ae", strokeWidth: 1.5 },
        parentChild: combine({
          // θ: parent centered over its subtree's angular span (nest approx —
          // see NOTES; circles can't grow to enclose).
          x: { kind: "align", alignment: "middle" },
          // r: distribute radially, REVERSED so depth 0 → largest r (outer
          // ring) and the tree grows inward. mode center → spacing in r-units.
          y: {
            kind: "distribute",
            spacing: 70,
            mode: "center",
          },
        }),
        sibling: combine({
          // θ: spread siblings angularly (spacing in radians, center mode).
          x: { kind: "distribute", spacing: (2 * Math.PI) / 6, mode: "center" },
          // r: siblings share a radial band.
          y: { kind: "align", alignment: "middle" },
        }),
        coord: polar(),
      },
      { w: 480, h: 480 }
    ),
};
