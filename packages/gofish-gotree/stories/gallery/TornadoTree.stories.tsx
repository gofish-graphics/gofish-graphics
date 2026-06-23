import type { Meta, StoryObj } from "@storybook/html";
import { rect, polar } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — TornadoTree (polar, nested-radial spiral).
// dsl: AxisIndependent, bottom-up.
//   X: Subtree flatten, Root juxtapose   → parentChild θ distribute, sibling θ distribute
//   Y: Subtree flatten (space-between),   → sibling r distribute
//      Root include                       → parentChild r INCLUDE = nest (radial containment)
//   CoordinateSystem polar, PolarAxis x-axis, PolarCenter right.
//   Element: Node rectangle, Color depth.
//
// Brief mapping (x = θ radians, y = r under polar()):
//   node      = rect, colored byDepth; link = none.
//   parentChild = (distribute θ, NEST r)  → parent's radial band ENCLOSES its
//                 subtree (the "include" relation on Y), while parent and
//                 subtree are offset angularly (the spiral "twist").
//   sibling   = (distribute θ, distribute r) → siblings step in BOTH angle and
//                 radius, fanning each level outward into the tornado curl.
//
// NEST-ON-r (the embedded radial dimension): nest needs a growable mark, so
// internal nodes get a rect with NO h (unsized on r, the nest axis) and a
// fixed θ-width (emX). nest({y}) grows the parent's radial band to inner.h +
// 2*pad and centers the subtree inside it. Leaves are fully sized on both axes.
// All sizes are in domain units (emX → θ radians, emY → r units).
//
// NOTES — polar gaps (no hacks; flagged):
//  - NEST ON r IS THE HARD CASE. Under polar, radial containment ("parent's
//    band encloses subtree") is the embedded-dimension-on-the-radial-axis
//    scenario the brief calls out. nest on y composes with a θ distribute on
//    the same 2 children, but the result is rough: the radial bands grow
//    bottom-up so absolute radii depend on subtree depth, and there is no
//    radial auto-fit — band thickness/pad are hand-picked constants, not
//    derived from the disc budget.
//  - PolarAxis "x-axis" (θ/r swap) is NOT expressible. polar() takes no options
//    and has no transposed variant, so the dsl's PolarAxis selector cannot be
//    expressed; θ stays on x, r on y regardless.
//  - PolarCenter "right", InnerRadius, Direction, CentralAngle: not expressible
//    (polar() is option-free) — center is fixed at the canvas middle.
//  - NO ANGULAR AUTO-FIT. θ spacing is a fixed per-level constant; it does not
//    shrink with node count, so the spiral overflows 2π and WRAPS. Here that
//    wrap is on-theme (the reference is itself a spiral that winds past 2π),
//    but it is not principled allocation — GoTree apportions angle by leaf
//    count; gofish-gotree has no equivalent yet.
const meta: Meta = { title: "GoTree / Gallery / TornadoTree" };
export default meta;

const TH = 0.13; // fixed angular width per node (radians, via emX) — thin slivers
const LEAF_H = 12; // leaf radial thickness (r units, via emY)

const node = (d: any) =>
  d.height === 0
    ? rect({
        w: TH,
        h: LEAF_H,
        emX: true,
        emY: true,
        fill: byDepth()(d),
        stroke: "white",
        strokeWidth: 1,
      })
    : rect({
        // internal node: NO h → grows on r via nest (radial containment).
        w: TH,
        emX: true,
        emY: true,
        fill: byDepth()(d),
        stroke: "white",
        strokeWidth: 1,
      });

export const TornadoTree: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: "none",
        parentChild: combine({
          // θ: offset parent from its subtree → the spiral twist (winds the arm).
          x: { kind: "distribute", spacing: 0.55, mode: "center" },
          // r: parent's band ENCLOSES the subtree (dsl Root "include").
          y: { kind: "nest", pad: 9 },
        }),
        sibling: combine({
          // θ: step siblings angularly (tight → packs the curl).
          x: { kind: "distribute", spacing: 0.42, mode: "center" },
          // r: step siblings radially too → fans the level outward (tornado).
          y: { kind: "distribute", spacing: 9, mode: "center" },
        }),
        coord: polar(),
      },
      { w: 480, h: 480 }
    ),
};
