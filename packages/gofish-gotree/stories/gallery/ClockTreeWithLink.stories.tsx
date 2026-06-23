import type { Meta, StoryObj } from "@storybook/html";
import { rect, polar } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — ClockTreeWithLink (a clock-face ring of nodes whose
// links bend inward across the disc).
// dsl: Element{Node:rectangle, Color:depth, Link:curveStepBefore} ;
//   CoordinateSystem polar {InnerRadius:0.79} ;
//   Layout bottom-up  X{Root:juxtapose, Subtree:flatten}
//                     Y{Root:within(bottom), Subtree:align(bottom)}.
//
// MAPPING. Under polar(): x = θ (radians 0..2π), y = r (radius). Relation map
// (include→nest, juxtapose/flatten→distribute, within/align→align):
//   parentChild = (distribute θ, align r)
//     - distribute θ: parent sits at the start of its subtree's angular slot,
//       the child group fanning out after it (X.Root:juxtapose → distribute).
//     - align r: parent and its subtree share the same ring (Y.Root:within →
//       align). NO radial step — parent and children are on one ring.
//   sibling = (distribute θ, align r)
//     - distribute θ: siblings tile angularly (X.Subtree:flatten → distribute).
//     - align r: siblings share the same ring (Y.Subtree:align → align).
// Because BOTH relationships distribute θ and align r, the WHOLE tree flattens
// onto a single ring (every node — root, internals, leaves — gets one angular
// slot at the same radius). That "all-distribute θ + align r" arrangement is
// the clock face. Links then connect parent→child across the disc.
//
// EMBEDDED θ-DIMENSION. Each rectangle node SWEEPS through θ, so its width is
// measured in θ-units (radians, emX:true) and sweeps an arc; its height is the
// ring's radial thickness (emY:true). With N nodes total and each node's
// θ-width = 2π/N, edge-mode distribute sums the widths up the tree so the ring
// tiles the full 2π exactly (N · leafTheta = 2π).
//
// NOTES — polar features in the dsl that gofish's polar() CANNOT express
// (polar() takes no options; no hacks, gaps flagged not faked):
//  - InnerRadius: 0.79 (a THIN outer ring with an empty center, the "clock
//    rim" look) is NOT achievable. align-r with no radial distribute pins the
//    band at the bottom of the r domain (r ∈ [0, bandHeight]), and r=0 maps to
//    the disc center — so the band fills the disc from center to edge (a full
//    pie ring) instead of a thin rim. polar() has no inner-radius origin knob.
//  - Link: curveStepBefore (an orthogonal radial-then-angular step, the inward
//    "spoke + arc" routing in the reference) is NOT supported — gofish-gotree
//    links only do {interpolation:"linear"} (orthogonal/arc throw as M4+). So
//    links are drawn as straight chords across the disc; under the polar
//    transform a straight parent→child segment renders as a chord that bows
//    relative to the reference's stepped spokes.
//  - NO angular auto-fit: angle is NOT allocated by subtree leaf-count by the
//    layout engine. The ring tiles only because every node's θ-width is
//    hand-set to leafTheta = 2π/N and summed by edge-mode distribute. A wrong
//    N or unbalanced widths overflows 2π and wedges wrap. GoTree sizes the
//    angular slots automatically (and by subtree size).
//  - Direction / StartAngle / CentralAngle / PolarAxis swap: polar() is a
//    fixed full-2π disc with no orientation, start-angle, sweep, or θ/r-axis
//    swap knob (polar() has no transposed variant), so the PolarAxis swap
//    is not expressible here.
const meta: Meta = { title: "GoTree / Gallery / ClockTreeWithLink" };
export default meta;

// A moderate uneven tree (3 levels) so the ring shows a mix of depths/colors,
// like the reference's interleaved light/dark arc segments.
const branch = (p: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `${p}${i}` }));
const clockData = {
  name: "root",
  children: [
    { name: "a", children: branch("a", 3) },
    { name: "b", children: branch("b", 2) },
    { name: "c", children: branch("c", 4) },
    { name: "d", children: branch("d", 1) },
    { name: "e", children: branch("e", 3) },
    { name: "f", children: branch("f", 2) },
    { name: "g", children: branch("g", 3) },
    { name: "h", children: branch("h", 2) },
  ],
};

// Count every node so each gets an equal θ slice that tiles the full 2π.
const countNodes = (t: any): number =>
  1 + (t.children ?? []).reduce((s: number, c: any) => s + countNodes(c), 0);
const N = countNodes(clockData);
const leafTheta = (2 * Math.PI) / N; // each node's angular share
const bandHeight = 60; // radial thickness of the ring band

// Rectangle node: width in θ-units (emX) sweeps an arc; height in r-units
// (emY) is the ring thickness. Colored by depth (dark root → light leaves).
const node = (d: any) =>
  rect({
    w: leafTheta,
    h: bandHeight,
    emX: true,
    emY: true,
    fill: byDepth()(d),
    stroke: "white",
    strokeWidth: 1.5,
  });

export const ClockTreeWithLink: StoryObj = {
  render: () =>
    mount(
      {
        node,
        // curveStepBefore is unsupported → straight chord (bows under polar).
        link: { interpolation: "linear", stroke: "#90a4ae", strokeWidth: 1 },
        parentChild: combine({
          // θ: parent at the start of its subtree's slot, group after it.
          x: { kind: "distribute", spacing: 0, mode: "edge" },
          // r: parent and subtree share the ring.
          y: { kind: "align", alignment: "middle" },
        }),
        sibling: combine({
          // θ: siblings tile angularly (edge mode sums θ-widths).
          x: { kind: "distribute", spacing: 0, mode: "edge" },
          // r: siblings share the ring.
          y: { kind: "align", alignment: "middle" },
        }),
        coord: polar(),
      },
      { w: 520, h: 520 },
      clockData
    ),
};
