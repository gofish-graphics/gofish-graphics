import type { Meta, StoryObj } from "@storybook/html";
import { circle, polar } from "gofish-graphics";
import { tree, combine } from "../../src";
import { byDepth, sampleTree } from "../data";
import { initializeContainer } from "../helper";

// GoTree gallery port — SpiralLayout (polar spiral node-link).
// dsl: AxisIndependent, X[subtree=flatten, root=juxtapose] Y[subtree=flatten,
//   root=juxtapose] under CoordinateSystem polar. Both flatten and juxtapose map
//   to `distribute`, so EVERY axis of BOTH relations distributes:
//     parentChild = (distribute x, distribute y)
//     sibling     = (distribute x, distribute y)
// Under polar(): x = θ (radians, 0..2π), y = r (radius). Distributing on both
// axes for both relations means each child steps BOTH around (θ) AND outward (r)
// relative to its parent and to its previous sibling — the points walk a spiral.
//   - parentChild: child sits one θ-step around and one r-step out from parent.
//   - sibling: each next sibling is one θ-step around and one r-step out from
//     the prior sibling, so a fan of children itself spirals.
// Point-like circle nodes ⇒ mode:"center" so spacing is read in domain units
// (radians for θ, r-units for r) and bboxes don't accumulate. Color = depth.
// Links straight ⇒ {interpolation: "linear"}. See the polar Sunburst /
// RadialNodes / RadialTree siblings for the same θ/r decomposition.
//
// NOTES — polar gaps (no hacks; flagged for follow-up):
//  - polar() takes NO options: GoTree's spiral knobs are not expressible here —
//    no InnerRadius (spiral start radius), Direction (CW/CCW winding), or
//    CentralAngle. (A θ/r axis swap is also not expressible.)
//  - No angular auto-fit: θ spacing is a fixed per-step constant, so the total
//    angle is (#steps × spacing) and freely exceeds 2π — the spiral wraps past
//    a full turn. For a spiral this overflow is partly intended, but it is
//    uncontrolled (GoTree allocates angle adaptively by subtree leaf count;
//    SubtreeWidth/Height "adaptive" from the dsl has no gofish-gotree analog).
//  - Combined θ+r distribution on the SAME relation is what yields the spiral,
//    but the per-step r and θ increments are independent constants rather than
//    a single Archimedean-spiral parameterization, so the pitch is only roughly
//    constant.
const meta: Meta = {
  title: "GoTree / Gallery / SpiralLayout",
};
export default meta;

const node = (d: any) =>
  circle({ r: 7, fill: byDepth()(d), stroke: "#1f3a5f", strokeWidth: 1 });

export const SpiralLayout: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Spiral Layout",
      description:
        "A spiral tree layout distributing nodes along both angular and radial axes to wind the hierarchy outward.",
    },
  },
  render: () => {
    const container = initializeContainer({ w: 520, h: 520 });
    tree(
      {
        node,
        link: { interpolation: "linear", stroke: "#90a4ae", strokeWidth: 1.5 },
        // parentChild: step around (θ) and outward (r) from the parent.
        parentChild: combine({
          x: {
            kind: "distribute",
            spacing: (2 * Math.PI) / 9,
            mode: "center",
            alignment: "middle",
          },
          y: {
            kind: "distribute",
            spacing: 50,
            mode: "center",
            alignment: "middle",
          },
        }),
        // sibling: each next sibling spirals one θ-step around and one r-step out.
        sibling: combine({
          x: {
            kind: "distribute",
            spacing: (2 * Math.PI) / 9,
            mode: "center",
            alignment: "middle",
          },
          y: {
            kind: "distribute",
            spacing: 26,
            mode: "center",
            alignment: "middle",
          },
        }),
        coord: polar(),
      },
      sampleTree
    ).render(container, { w: 520, h: 520 });
    return container;
  },
};
