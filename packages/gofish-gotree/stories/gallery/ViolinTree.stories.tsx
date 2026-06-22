import type { Meta, StoryObj } from "@storybook/html";
import { rect, polar } from "gofish-graphics";
import { combine, byDepth, mount, sampleTree } from "./_shared";

// GoTree gallery port — ViolinTree (polar nested bands, no links).
// dsl: bottom-up; X[Subtree flatten / Root juxtapose] Y[Subtree flatten / Root
// include] under CoordinateSystem polar; Node rectangle, Color depth.
//   - Root (parent↔subtree) relation: X juxtapose → distribute θ ; Y include →
//     nest r. So parentChild = (distribute θ, nest r): the parent's rect grows
//     RADIALLY to embed its subtree (the "embedded radial dimension").
//   - Subtree (sibling↔sibling) relation: X flatten → distribute θ ; Y flatten →
//     distribute r. So sibling = (distribute θ, distribute r).
// Under polar(): x = θ (radians 0..2π), y = r (radius). So distribute-x spreads
// nodes angularly and distribute/nest-y stacks/embeds them radially.
//
// Node = rect, color byDepth, link = none. Internal nodes are left UNSIZED on r
// (h) so nest-on-r grows them to wrap their subtree; leaves are sized on r by
// d.data.value, so the radial "thickness" varies leaf-to-leaf — the violin
// silhouette. θ-width is a fixed per-node constant (no angular auto-fit).
//
// POLAR LIMITATIONS (no hacks here — flagged honestly):
//  - polar() takes NO options. The dsl's PolarCenter:"bottom" and
//    StartAngle:0.01 (and any CentralAngle/Direction/InnerRadius) are NOT
//    expressible — our disc is centered with θ starting at 0.
//  - No angular auto-fit. θ-width is a fixed constant per node and sibling θ
//    spacing is fixed; GoTree allocates θ by subtree leaf-count so its violins
//    pack the disc exactly. Here a wide level can overflow the 2π budget and
//    wrap. Sizes/spacings are hand-tuned for `sampleTree` (8 leaves).
//  - nest-on-r (embedded radial dimension) is rough: combine() applies the
//    parentChild x-distribute to [parent, childGroup] too, so I use
//    spacing:0/mode:"center" there to keep the parent θ-centered over its
//    subtree rather than juxtaposed beside it. True GoTree juxtapose offsets
//    the parent angularly; that isn't faithfully reproducible without angular
//    allocation. The radial embedding (nest y) is the load-bearing mapping.
//  - bottom-up layout (leaves drive sizing upward) is implicit in how nest
//    grows internals from their children; there's no explicit "Mode" knob.
const meta: Meta = { title: "GoTree / Gallery / ViolinTree" };
export default meta;

const LEAF_THETA = (2 * Math.PI) / 9; // fixed θ-width per node (~9 slots)
const VALUE_R = 14; // r-units per unit of d.data.value (violin thickness)

const node = (d: any) =>
  d.height === 0
    ? rect({
        w: LEAF_THETA,
        h: d.data.value * VALUE_R, // leaf radial thickness ∝ value
        emX: true,
        emY: true,
        fill: byDepth()(d),
        stroke: "white",
        strokeWidth: 1,
      })
    : rect({
        // internal: unsized on r (h) → nest grows it to embed the subtree.
        w: LEAF_THETA,
        emX: true,
        emY: true,
        fill: byDepth()(d),
        stroke: "white",
        strokeWidth: 1,
      });

export const ViolinTree: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: "none",
        // parentChild: X juxtapose → distribute θ ; Y include → nest r.
        // spacing:0/center on θ keeps parent θ-centered over its subtree (see
        // NOTES); nest on r grows the parent's rect to embed the subtree.
        parentChild: combine({
          x: { kind: "distribute", spacing: 0, mode: "center" },
          y: { kind: "nest", pad: 6 },
        }),
        // sibling: X flatten → distribute θ ; Y flatten → distribute r.
        sibling: combine({
          x: { kind: "distribute", spacing: LEAF_THETA, mode: "center" },
          y: { kind: "distribute", spacing: 0, mode: "center" },
        }),
        coord: polar(),
      },
      { w: 520, h: 520 }
    ),
};
