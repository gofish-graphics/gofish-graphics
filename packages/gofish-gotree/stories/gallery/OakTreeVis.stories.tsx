import type { Meta, StoryObj } from "@storybook/html";
import { circle, polar } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — OakTreeVis (polar node-link, depth-colored circles).
// dsl: Node=circle, Color=depth, StaticSize=8, Link=curveStepBefore,
//   CoordinateSystem=polar, PolarAxis=x-axis, PolarCenter=right,
//   Layout AxisIndependent (bottom-up):
//     X: Root=within/align(left)  Subtree=flatten (→ distribute)
//     Y: Root=include  (→ nest)   Subtree=flatten (→ distribute)
// Under polar(): x = θ (radians, 0..2π), y = r (radius). So the combine brief is:
//   parentChild = (align θ,       nest r)
//   sibling     = (distribute θ,  distribute r)
// Distinctive vs. the other radial ports: the SIBLING relation distributes on
// BOTH axes — siblings step outward in r as they fan in θ. That radial stagger
// (plus the step-link corners in the dsl) is what gives the reference its
// spiral / oak-branch silhouette: each level's children climb to larger radii
// rather than sharing one ring.
//
// ─── POLAR GAPS (no hacks; flagged for follow-up) ──────────────────────────────
//  1. nest on r (y) is the "embedded dimension" hard case, here on the RADIAL
//     axis: the dsl's Y Root=include wants the parent's radial band to ENCLOSE
//     (contain) its subtree. nest needs a mark that can GROW on the constrained
//     axis; a fixed circle is a point and cannot grow on r. So nest-r is not
//     faithfully expressible with circle nodes. Three options exist —
//     (a) swap internal nodes to a small rect (growable on r) at the cost of the
//     dsl's Node=circle; (b) approximate with align-r; (c) approximate with
//     distribute-r. Option (b) was tried first and COLLAPSES the tree: aligning
//     r between parent and subtree removes all parent→child radial separation,
//     so the whole tree degenerates into a single spiral string of circles
//     (no branching). This port therefore takes (c): parentChild DISTRIBUTES on
//     r (parent inner, subtree outer), modeling nest's containment as radial
//     ADJACENCY — the same pattern the other radial ports use, and the only one
//     that yields a branching radial tree with point nodes. The true
//     containment/wrapping semantics of nest are still lost; recovering them
//     needs a growable internal-node mark or a nest constraint that participates
//     in the polar transform's r budget.
//  2. No angular auto-fit: sibling θ spacing is a fixed per-level constant
//     (2π/6 rad between centers) that does NOT shrink with the number of nodes
//     at a depth. GoTree allocates angle by subtree leaf-count; gofish-gotree
//     has none, so deep/wide trees overflow the 2π budget and wedges wrap —
//     visible here as the spiral overlap, which actually echoes the reference.
//  3. polar() takes no options: the dsl's PolarAxis=x-axis swap, PolarCenter,
//     InnerRadius, Direction, CentralAngle, and Mode=bottom-up are not
//     expressible. (PolarAxis x-axis already matches gofish's x→θ default, so
//     plain polar() is the closer match here; a θ/r swap would map the
//     radial sibling-stagger onto θ and lose the spiral.)
//  4. Link=curveStepBefore (orthogonal step links) is NOT supported →
//     {interpolation:"linear"}. The reference's right-angle "step" corners
//     therefore render as straight segments, which bow into arcs under the polar
//     transform (a straight cartesian edge maps to a polar arc).
//  5. mode:"center" on every distribute treats circles as points (no bbox
//     accumulation) so spacing reads in domain units — radians for θ, r-units
//     for r.
const meta: Meta = { title: "GoTree / Gallery / OakTreeVis" };
export default meta;

// Node=circle, Color=depth, StaticSize=8 → radius ~5.
const node = (d: any) =>
  circle({ r: 5, fill: byDepth()(d), stroke: "#1f3a5f", strokeWidth: 1 });

export const OakTreeVis: StoryObj = {
  render: () =>
    mount(
      {
        node,
        // curveStepBefore unsupported → linear (see GAP 4).
        link: { interpolation: "linear", stroke: "#90a4ae", strokeWidth: 2 },
        parentChild: combine({
          // θ: parent angularly centered over its subtree's span (dsl within/align).
          x: { kind: "align", alignment: "middle" },
          // r: dsl wants nest (radial containment); approximated with distribute
          //    (parent inner, children outward) — see GAP 1. mode center → r-units.
          y: {
            kind: "distribute",
            spacing: 60,
            mode: "center",
            alignment: "middle",
          },
        }),
        sibling: combine({
          // θ: fan siblings angularly (radians between centers, center mode).
          x: { kind: "distribute", spacing: (2 * Math.PI) / 6, mode: "center" },
          // r: stagger siblings radially — the spiral/oak stagger (dsl flatten).
          y: { kind: "distribute", spacing: 30, mode: "center" },
        }),
        coord: polar(),
      },
      { w: 520, h: 520 }
    ),
};
