import type { Meta, StoryObj } from "@storybook/html";
import { circle, polar } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — RotationTree (radial node-link with rotated/arc links).
// dsl: Node=circle, Link=arccurve(ArcDirection bottom), Color=depth,
//   CoordinateSystem=polar, Layout=AxisIndependent / Mode bottom-up:
//     X (= θ under polar): Root juxtapose / Subtree flatten   → both distribute
//     Y (= r under polar): Root within   / Subtree align      → both align
// Relation→combine kind (see _shared.ts): juxtapose/flatten→distribute,
//   within/align→align. So, mapping Root→parentChild and Subtree→sibling:
//     parentChild = (distribute θ, align r)
//     sibling     = (distribute θ, align r)
// polar() maps x → θ (radians 0..2π), y → r (radius).
//
// The defining trait of RotationTree vs. the sibling RadialTree port: RadialTree
// distributes parentChild on r (juxtapose y) so the tree grows OUTWARD ring by
// ring. RotationTree instead distributes parentChild on θ (juxtapose x) and
// ALIGNS r — i.e. a parent is offset ANGULARLY from its subtree rather than
// radially. That angular parent↔child offset, compounding down the tree, is what
// produces the reference's pinwheel "rotation" of nodes around the disc.
//
// Point-like circle nodes ⇒ mode:"center" so spacing is read in domain units
// (radians for θ) and per-node bboxes don't accumulate under the transform.
// Color is depth-driven (dark root → light leaves), matching the reference.
//
// NOTES (polar gaps — no hacks here; honest mapping, flagged for follow-up):
//  - RADIAL COLLAPSE IS THE BIG ONE. The dsl puts r under align on BOTH
//    parentChild (within) and sibling (align), so NOTHING in the spec
//    distributes radially. gofish-gotree has no `flatten`/`within` primitive and
//    no bottom-up adaptive radial allocation, so it cannot reproduce GoTree's
//    structure where the root pops to the center (r≈0) while every other node
//    flattens onto an outer ring. With only align constraints on r, all nodes
//    share one radius. To keep the angular "rotation" reading visible at all,
//    the node factory sizes circles by depth and the layout relies on the θ
//    offsets; the genuine root-center-vs-outer-ring radial separation of the
//    reference is NOT expressible.
//  - Link=arccurve is NOT supported. There is no arc/curve link interpolation,
//    so links fall back to {curve:"straight"}. Under polar() a straight
//    cartesian segment between two (θ,r) endpoints still bows, but it does NOT
//    reproduce GoTree's controlled arccurve with ArcDirection=bottom, so the
//    characteristic uniform swirl of the reference is only approximated.
//  - NO angular auto-fit. Sibling/parent angular spacing is a fixed per-level
//    constant, NOT derived from subtree leaf-count the way GoTree fills 2π
//    exactly. A wider/deeper tree overflows the 2π budget and wraps.
//  - polar() takes NO options: InnerRadius, Direction, CentralAngle, and the
//    PolarAxis θ/r swap from the dsl are not expressible.
//  - LinkWidth=adaptive / Thickness=static(2) is not expressible on the link
//    mark beyond a single fixed strokeWidth.
const meta: Meta = { title: "GoTree / Gallery / RotationTree" };
export default meta;

const node = (d: any) =>
  circle({
    r: d.depth === 0 ? 9 : 7,
    fill: byDepth()(d),
    stroke: "#1f3a5f",
    strokeWidth: 1,
  });

export const RotationTree: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: { curve: "straight", stroke: "#5b6b7a", strokeWidth: 1.5 },
        // Root juxtapose / within → distribute θ, align r. The θ offset between a
        // parent and its subtree group is the "rotation".
        parentChild: combine({
          x: {
            kind: "distribute",
            spacing: (2 * Math.PI) / 9,
            mode: "center",
          },
          y: { kind: "align", alignment: "middle" },
        }),
        // Subtree flatten / align → distribute θ, align r. Siblings fan out
        // angularly on the shared radius.
        sibling: combine({
          x: {
            kind: "distribute",
            spacing: (2 * Math.PI) / 9,
            mode: "center",
          },
          y: { kind: "align", alignment: "middle" },
        }),
        coord: polar(),
      },
      { w: 520, h: 520 }
    ),
};
