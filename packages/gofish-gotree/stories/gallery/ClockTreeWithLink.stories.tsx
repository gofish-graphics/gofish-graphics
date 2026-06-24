import type { Meta, StoryObj } from "@storybook/html";
import { rect, polar, datum } from "gofish-graphics";
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
// NOW EXPRESSIBLE (parameterized polar(), #620):
//  - InnerRadius: 0.79 — APPLIED via `polar({ innerRadius: 0.79 })`. The thin
//    outer clock rim with an empty center that the links route through, instead
//    of a full pie ring filling the disc from r=0. This was the headline gap.
//  - Direction / StartAngle / CentralAngle: polar() now has these knobs; kept at
//    the defaults here (full 2π disc, 12-o'clock start) — the GoTree spec only
//    customizes InnerRadius for this chart.
//
// REMAINING GAPS (flagged, not faked):
//  - Link: curveStepBefore (an orthogonal radial-then-angular step, the inward
//    "spoke + arc" routing in the reference) is NOT supported — gofish-gotree
//    links only do {interpolation:"linear"} (orthogonal/arc throw as M4+). So
//    links are drawn as straight chords through the hollow center; under the
//    polar transform a straight parent→child segment bows relative to the
//    reference's stepped spokes.
//  - Angular AUTO-FIT (#618): each node carries a unit `thetaSize` weight and the
//    coord fits the summed weights to the budget, so the ring closes for any node
//    count with no hand-set 2π/N. (Weighting by subtree size instead of a unit
//    weight is just `thetaSize: datum(d.leafCount)`.)
//  - No θ/r axis swap (no transposed variant; PolarAxis swap not expressible);
//    not needed here.
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

const bandHeight = 60; // radial thickness of the ring band

// Rectangle node: thetaSize is a unit angular WEIGHT (every node an equal slot);
// the coord sums the weights and fits them to the angular budget, so the ring
// closes exactly with no hand-set 2π/N. emX/emY make θ sweep an arc and r the
// ring thickness. Colored by depth (dark root → light leaves).
const node = (d: any) =>
  rect({
    thetaSize: datum(1),
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
        // InnerRadius:0.79 — the thin outer clock rim with an empty center that
        // the step/arc links route through. Now expressible.
        coord: polar({ innerRadius: 0.79 }),
      },
      { w: 520, h: 520 },
      clockData
    ),
};
