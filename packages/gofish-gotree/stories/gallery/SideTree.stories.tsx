import type { Meta, StoryObj } from "@storybook/html";
import { circle, polar } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — SideTree (polar node-link, "side-leaning" tree).
// dsl: gallery/SideTree/dsl.json
//   Node: circle, StaticSize 6 ; Link: straight ; Color: depth
//   CoordinateSystem: polar, StartAngle 0.17
//   Layout (AxisIndependent, bottom-up):
//     X.Root = juxtapose, X.Subtree = align
//     Y.Root = juxtapose, Y.Subtree = flatten
//   Relation → combine kind: juxtapose/flatten → distribute, align → align.
//   GoTree "Root" = parent↔child relation, "Subtree" = among-siblings relation, so:
//     parentChild = (distribute X, distribute Y)
//     sibling     = (align X,      distribute Y)
//
// Under polar(): x = θ (radians, 0..2π), y = r (radius). Map brief x=θ, y=r:
//   - parentChild distributes on BOTH θ and r: a child moves outward in r AND
//     sweeps a little in θ from its parent → the characteristic diagonal "lean".
//   - siblings ALIGN in θ (share one angle / lie on a common spoke) and
//     DISTRIBUTE in r → a sibling group stacks radially along a single ray,
//     reading as the long straight spines in the reference image.
// Point-like circle nodes ⇒ mode:"center" on every distribute axis so spacing
// is read in domain units (radians for θ, r-units for r) and bboxes don't
// accumulate. Same convention as RadialTree / RadialNodes / Sunburst.
//
// POLAR LIMITATIONS (no hacks here — flagged for follow-up):
//  - polar() now takes options — { innerRadius, centralAngle, startAngle,
//    direction, center } since #620 — so the dsl's StartAngle 0.17 (and any
//    InnerRadius / Direction / CentralAngle) are now expressible via
//    polar({ startAngle: 0.17, ... }) since #620 (not yet applied here); the
//    tree still starts at the default angle instead of being rotated ~0.17 rad.
//  - No angular auto-fit for POINT nodes: θ spacing is a fixed per-level
//    constant, it does not shrink with node count, so wide/deep trees can
//    overflow the 2π budget and wrap. GoTree's "adaptive" SubtreeWidth/Height
//    allocate space by subtree size. Wedge (rect) nodes now auto-fit via
//    thetaSize since #622; this point/circle-node gap is tracked in #627
//    (data-position workaround shown in RadialDeep.stories.tsx), so spacings
//    here are hand-tuned.
//  - The dsl's bottom-up Mode and per-relation Margins (0.01/0.07/0.94) are
//    not modeled — only the relation→constraint-kind mapping is ported.
const meta: Meta = { title: "GoTree / Gallery / SideTree" };
export default meta;

const node = (d: any) =>
  circle({ r: 6, fill: byDepth()(d), stroke: "#1f3a5f", strokeWidth: 1 });

export const SideTree: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: { interpolation: "linear", stroke: "#607d8b", strokeWidth: 1.5 },
        // parentChild = (distribute θ, distribute r): child leans away in angle
        // and steps outward in radius from its parent.
        parentChild: combine({
          x: {
            kind: "distribute",
            spacing: 0.5,
            mode: "center",
          },
          y: { kind: "distribute", spacing: 70, mode: "center" },
        }),
        // sibling = (align θ, distribute r): siblings share a spoke (one angle)
        // and stack out along the radius.
        sibling: combine({
          x: { kind: "align", alignment: "middle" },
          y: { kind: "distribute", spacing: 90, mode: "center" },
        }),
        coord: polar(),
      },
      { w: 560, h: 560 }
    ),
};
