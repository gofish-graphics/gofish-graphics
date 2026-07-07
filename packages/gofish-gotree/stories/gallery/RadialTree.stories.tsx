import type { Meta, StoryObj } from "@storybook/html";
import { circle, polar } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — RadialTree (polar node-link).
// dsl: cartesian X[within/flatten] Y[juxtapose/align] under CoordinateSystem polar.
//   parentChild = (align x, distribute y) ; sibling = (distribute x, align y)
// Under polar(): x = θ (radians, 0..2π), y = r (radius). So:
//   - parentChild distributes on y (radial): parent at inner radius, subtree outward.
//   - siblings distribute on x (angular): spread around the circle.
// Point-like circle nodes ⇒ mode:"center" so spacing is read in domain units
// (radians for θ, r-units for r) and bboxes don't accumulate. See also the
// hand-tuned Sunburst/RadialNodes in ../Tree.stories.tsx.
//
// POLAR LIMITATIONS (no hacks here — flagged for follow-up):
//  - Angular spacing is a fixed per-level constant; it does NOT shrink with the
//    number of nodes at a depth, so deep/wide trees overflow the 2π budget and
//    wedges wrap. GoTree's polar layout allocates angle by subtree leaf-count;
//    gofish-gotree has no angular auto-fit yet.
//  - polar() takes no options: InnerRadius, Direction, CentralAngle, and the
//    PolarAxis θ/r swap from the dsl are not expressible.
const meta: Meta = { title: "GoTree / Gallery / RadialTree" };
export default meta;

const node = (d: any) =>
  circle({ r: 7, fill: byDepth()(d), stroke: "#1f3a5f", strokeWidth: 1 });

export const RadialTree: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: { interpolation: "linear", stroke: "#90a4ae", strokeWidth: 1.5 },
        parentChild: combine({
          // θ: parent centered over its subtree's angular span.
          x: { kind: "align", alignment: "middle" },
          // r: parent inner, children outward (mode center → spacing in r-units).
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
          y: { kind: "align", alignment: "middle" },
        }),
        coord: polar(),
      },
      { w: 480, h: 480 }
    ),
};
