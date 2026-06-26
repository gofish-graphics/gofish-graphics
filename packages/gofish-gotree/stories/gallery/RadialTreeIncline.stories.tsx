import type { Meta, StoryObj } from "@storybook/html";
import { circle, polar } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — RadialTreeIncline (polar node-link with an "incline").
// dsl: cartesian X[juxtapose/flatten] Y[juxtapose/align] under CoordinateSystem
//   polar, Mode bottom-up. Mapping Root-relation → parentChild, Subtree-relation
//   → sibling, per axis:
//     X.Root=juxtapose, X.Subtree=flatten  → parentChild θ=distribute, sibling θ=distribute
//     Y.Root=juxtapose, Y.Subtree=align    → parentChild r=distribute, sibling r=align
//   So under polar() (x = θ radians 0..2π, y = r radius):
//     - parentChild distributes on BOTH θ and r — this is the "incline": the
//       parent is offset from its subtree both angularly (θ) and radially (r),
//       so edges fan out on a slight slant instead of pointing straight out.
//       (Contrast RadialTree, where parentChild aligns θ and only distributes r.)
//     - siblings distribute on θ (spread around the ring) and align on r (share
//       a radial band).
// Point-like circle nodes ⇒ mode:"center" on every distribute axis so spacing
// is read in domain units (radians for θ, r-units for r) and bboxes don't
// accumulate. Color by depth; straight links (interpolation linear) — matches
// the dsl Element { Node: circle, Link: straight, Color: depth }.
//
// NOTES (polar gaps — no hacks here, flagged for follow-up):
//  - The dsl's incline is a quantitative offset (X.Subtree Margin "-0.13w",
//    Y.Root Margin "0.2"); gofish-gotree has no margin-as-fraction-of-width, so
//    the angular/radial parent offsets are fixed per-level constants, not
//    proportional to subtree width. The slant is approximated, not measured.
//  - Angular spacing is a fixed per-level constant; it does NOT shrink with the
//    number of nodes at a depth, so deep/wide trees overflow the 2π budget and
//    wedges wrap. GoTree allocates angle by subtree leaf-count
//    (SubtreeWidth: "adaptive"); gofish-gotree has no angular auto-fit yet.
//  - polar() takes no options: InnerRadius, Direction, CentralAngle and a θ/r
//    swap (PolarAxis) are not expressible. bottom-up Mode and LinkWidth
//    "adaptive" are likewise not modeled.
const meta: Meta = { title: "GoTree / Gallery / RadialTreeIncline" };
export default meta;

const node = (d: any) =>
  circle({ r: 7, fill: byDepth()(d), stroke: "#1f3a5f", strokeWidth: 1 });

export const RadialTreeIncline: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: { route: "straight", stroke: "#90a4ae", strokeWidth: 1.5 },
        parentChild: combine({
          // θ: parent offset angularly from its subtree (the incline).
          x: {
            kind: "distribute",
            spacing: (2 * Math.PI) / 14,
            mode: "center",
          },
          // r: parent inner, children outward (spacing in r-units).
          y: { kind: "distribute", spacing: 70, mode: "center" },
        }),
        sibling: combine({
          // θ: spread siblings angularly (spacing in radians, center mode).
          x: { kind: "distribute", spacing: (2 * Math.PI) / 7, mode: "center" },
          // r: siblings share a radial band.
          y: { kind: "align", alignment: "middle" },
        }),
        coord: polar(),
      },
      { w: 480, h: 480 }
    ),
};
