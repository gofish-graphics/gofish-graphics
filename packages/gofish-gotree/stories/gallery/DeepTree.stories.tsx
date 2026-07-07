import type { Meta, StoryObj } from "@storybook/html";
import { circle, polar } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — deep-tree (a deep radial node-link, sunburst family).
// dsl: node=circle, color=depth, link=curve; CoordinateSystem polar
//   (Direction clockwise, PolarAxis y-axis, InnerRadius 0, CentralAngle 1).
//   Layout AxisIndependent, Mode top-down:
//     X.Root include  / X.Subtree flatten  → parentChild nest, sibling distribute
//     Y.Root juxtapose / Y.Subtree align   → parentChild distribute, sibling align
// Under polar(): x = θ (radians, 0..2π), y = r (radius). So the brief mapping is:
//   parentChild = (nest θ, distribute r) :
//     - θ nest  → parent centered over its subtree's angular span (a circle is a
//       point, so nest only re-centers the parent; it doesn't grow it).
//     - r distribute → one ring per depth (parent inner, children outward).
//   sibling = (distribute θ, align r) :
//     - θ distribute → siblings spread angularly (spacing in radians).
//     - r align → all siblings share a radius (same ring).
// Point-like circle nodes ⇒ mode:"center" on every distribute so spacing is read
// in domain units (radians for θ, r-units for r) and pixel bboxes don't
// accumulate. Same layout family as the Sunburst / RadialTree stories, deeper.
//
// NOTES — polar limitations (no hacks; flagged for follow-up):
//  - Links: the dsl asks for "curve" links with depth-driven width
//    (LinkWidth=depth). Curved link interpolation isn't wired through the coord
//    transform yet, so this falls back to fixed-width {interpolation:"linear"}
//    (the route→curve link API lands in draft PR #637). Under polar() the
//    straight segments still bow into arcs through the coord transform, but they
//    are NOT the dsl's authored curves and ignore LinkWidth/Thickness=depth.
//  - No angular auto-fit for POINT nodes: sibling θ spacing is a fixed per-level
//    constant, it does NOT shrink with the number of nodes at a depth. GoTree
//    allocates angle by subtree leaf-count; here center-mode distribute places
//    sibling-subtree *centers* a fixed angle apart regardless of how wide each
//    subtree is, so a genuinely deep/wide tree overflows the 2π budget —
//    subtrees overlap and the outer rings wrap. Wedge (rect) nodes now auto-fit
//    angularly via thetaSize since #622; the gap for point/circle nodes like
//    these is tracked in #627, and its data-position workaround (leaf-slot box
//    packing in the data pass) is demonstrated in RadialDeep.stories.tsx. The
//    tree below is kept modest so the structure stays legible.
//  - polar() now takes options — { innerRadius, centralAngle, startAngle,
//    direction, center } since #620 — so InnerRadius 0, Direction "clockwise",
//    CentralAngle 1 and StartAngle 0 are now expressible via polar({ ... })
//    since #620 (not yet applied here). Still NOT expressible: the PolarAxis
//    y-axis (θ/r) swap from the dsl, and PolarCenter "bottom" — a polar-space
//    anchor, which polar's screen-offset `center` does not cover. Absent those,
//    polar() puts r=0 at the canvas center and sweeps θ counter-clockwise over
//    the full 0..2π.
const meta: Meta = { title: "GoTree / Gallery / deep-tree" };
export default meta;

// A deep tree — 4 levels below the root (depth 0..4) so several rings show the
// "deep" structure. Branching kept low (binary) so the fixed angular budget
// isn't blown out completely. 16 leaves at the outer ring.
const deepTree = (() => {
  const make = (depth: number, prefix: string): any =>
    depth === 0
      ? { name: prefix }
      : {
          name: prefix,
          children: [
            make(depth - 1, prefix + "a"),
            make(depth - 1, prefix + "b"),
          ],
        };
  return make(4, "r");
})();

// circle nodes, depth-colored (dark blue root → light blue leaves).
const node = (d: any) =>
  circle({ r: 6, fill: byDepth()(d), stroke: "#08306b", strokeWidth: 1 });

export const DeepTree: StoryObj = {
  render: () =>
    mount(
      {
        node,
        // NOTE: dsl wants curve links (LinkWidth=depth); falling back to linear.
        link: { interpolation: "linear", stroke: "#5f6b7a", strokeWidth: 1.5 },
        parentChild: combine({
          // θ: nest centers the parent circle over its subtree's angular span.
          x: { kind: "nest", pad: 0 },
          // r: one ring per depth (center mode → spacing in r-units).
          y: {
            kind: "distribute",
            spacing: 72,
            mode: "center",
            alignment: "middle",
          },
        }),
        sibling: combine({
          // θ: spread siblings angularly (spacing in radians, center mode).
          x: {
            kind: "distribute",
            spacing: (2 * Math.PI) / 10,
            mode: "center",
            alignment: "middle",
          },
          // r: all siblings share a radius (same ring).
          y: { kind: "align", alignment: "middle" },
        }),
        coord: polar(),
      },
      { w: 560, h: 560 },
      deepTree
    ),
};
