import type { Meta, StoryObj } from "@storybook/html";
import { circle, polar } from "gofish-graphics";
import { tree, combine } from "../../src";
import { byDepth, sampleTree } from "../data";
import { initializeContainer } from "../helper";

// GoTree gallery port — MultilevelSilhouetteTree (polar node-link variant).
//
// The gotree gallery example is a multi-template spec: its dsl0.json drives a
// per-depth SliceLayout silhouette, while its dsl2.json ("Node-Link") is the
// circle/straight-link polar reading captured by the brief here:
//   Element: { Node: circle, Link: straight, Color: depth }
//   CoordinateSystem: polar
//   parentChild = (align θ, distribute r)   sibling = (distribute θ, align r)
//
// Under polar(): x = θ (radians, 0..2π), y = r (radius). Mapping the brief:
//   - parentChild ALIGNS on θ (parent shares its subtree's angular center) and
//     DISTRIBUTES on r (parent inner, children one ring outward).
//   - sibling DISTRIBUTES on θ (fan around the circle) and ALIGNS on r (all
//     siblings share one radial ring).
// Point-like circle nodes ⇒ mode:"center" so spacing is read in domain units
// (radians for θ, r-units for r) and node bboxes don't accumulate. Same
// decomposition as the RadialTree gallery port and the RadialNodes story.
//
// NOTES (polar limitations — no hacks here, flagged for follow-up):
//  - The real MultilevelSilhouetteTree alternates a SliceLayout template per
//    depth parity (dsl0: NodeQuery "depth%2==1" / "depth%2==0"). That silhouette
//    rendering (wedge bands sized by value, per-depth template swap) is a
//    separate layout from this node-link reading and is not reproduced here.
//  - Angular spacing is a FIXED per-level constant: it does not shrink with the
//    number of nodes at a depth, so deep/wide trees overflow the 2π budget and
//    wedges wrap. GoTree's polar layout allocates angle by subtree leaf-count;
//    gofish-gotree has no angular auto-fit.
//  - polar() takes no options: InnerRadius, Direction, CentralAngle, and the
//    PolarAxis θ/r swap from the dsl are not expressible (no transposed
//    variant).

const meta: Meta = {
  title: "GoTree / Gallery / MultilevelSilhouetteTree",
};
export default meta;

const node = (d: any) =>
  circle({ r: 7, fill: byDepth()(d), stroke: "#1f3a5f", strokeWidth: 1 });

export const MultilevelSilhouetteTree: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Multilevel Silhouette Tree",
      description:
        "A multilevel radial node-link tree read outward from the center as a silhouette.",
    },
  },
  render: () => {
    const container = initializeContainer({ w: 480, h: 480 });
    tree(
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
          // r: all siblings share one ring.
          y: { kind: "align", alignment: "middle" },
        }),
        coord: polar(),
      },
      sampleTree
    ).render(container, { w: 480, h: 480 });
    return container;
  },
};
