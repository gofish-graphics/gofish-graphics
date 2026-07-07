import type { Meta, StoryObj } from "@storybook/html";
import { circle, polar } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — OrthogonalGridEmbedding (polar node-link).
// dsl: CoordinateSystem polar; Node circle; Link orthogonal; Color depth.
//   Layout X (= θ): Root within / Subtree flatten ;
//          Y (= r): Root juxtapose / Subtree align.
// Relation → combine kind: within/align → align, juxtapose/flatten → distribute.
// Root relation = parentChild ; Subtree relation = sibling. So:
//   parentChild = (align θ, distribute r)   — parent centered angularly over
//     its subtree's wedge; parent inner, children one ring outward.
//   sibling     = (distribute θ, align r)   — siblings spread around the
//     circle on a shared radius.
// Under polar(): x = θ (radians, 0..2π), y = r (radius).
// Point-like circle nodes ⇒ mode:"center" on the distribute axes so spacing is
// read in domain units (radians for θ, r-units for r) and bboxes don't
// accumulate. Color byDepth() (sequential blue ramp, dark root → light leaves),
// matching the dsl's Color: depth. This is the same per-axis decomposition as
// the RadialTree port — OrthogonalGridEmbedding differs only in its link style
// (orthogonal vs. straight), which polar cannot honor (see NOTES).
//
// NOTES — features in the dsl that gofish-gotree cannot express here (no hacks):
//  - Orthogonal links: the dsl's Link is "orthogonal" (right-angle elbow
//    connectors — in the reference, a radial spoke from the parent meeting a
//    short tangential stub at each child). The link renderer has no orthogonal
//    mode, so links fall back to {interpolation:"linear"} (straight segments).
//    Under polar() even those straight segments bow along arcs, so the crisp
//    grid look of the reference is lost.
//  - No angular auto-fit: angular spacing is a fixed per-level constant; it does
//    NOT shrink with the number of nodes at a depth. GoTree allocates θ by
//    subtree leaf-count, so deep/wide trees there stay within 2π; here a wide
//    level overflows the 2π budget and wedges wrap. Spacing is hand-tuned for
//    the small sampleTree.
//  - polar() takes no options: InnerRadius, Direction, CentralAngle, and the
//    PolarAxis θ/r swap are not expressible (no transposed variant).
const meta: Meta = { title: "GoTree / Gallery / OrthogonalGridEmbedding" };
export default meta;

const node = (d: any) =>
  circle({ r: 7, fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 });

export const OrthogonalGridEmbedding: StoryObj = {
  render: () =>
    mount(
      {
        node,
        // Orthogonal links unsupported → linear fallback (see NOTES).
        link: { interpolation: "linear", stroke: "#90a4ae", strokeWidth: 1.5 },
        parentChild: combine({
          // θ: parent centered over its subtree's angular span.
          x: { kind: "align", alignment: "middle" },
          // r: parent inner, children one ring outward (center mode → spacing
          // in r-units).
          y: {
            kind: "distribute",
            spacing: 70,
            mode: "center",
            alignment: "middle",
          },
        }),
        sibling: combine({
          // θ: spread siblings angularly (spacing in radians, center mode).
          x: {
            kind: "distribute",
            spacing: (2 * Math.PI) / 6,
            mode: "center",
            alignment: "middle",
          },
          // r: siblings share a radius.
          y: { kind: "align", alignment: "middle" },
        }),
        coord: polar(),
      },
      { w: 480, h: 480 }
    ),
};
