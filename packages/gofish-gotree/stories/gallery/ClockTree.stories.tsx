import type { Meta, StoryObj } from "@storybook/html";
import { rect, polar, datum } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — ClockTree (nodes arranged around a clock-face ring).
// dsl: Element{Node:rectangle, RootHeight:rdepth, Color:depth} ; Link none ;
//   Layout bottom-up X{Subtree:flatten, Root:juxtapose} Y{Subtree:align,
//   Root:within/bottom} ; CoordinateSystem polar {StartAngle:0.01,
//   InnerRadius:0.72}.
//
// MAPPING. Under polar(): x = θ (radians 0..2π), y = r (radius). Brief mapping:
//   parentChild = (distribute θ, align r)
//   sibling     = (distribute θ, align r)
//   Both relationships distribute on θ and align on r — i.e. EVERY node (parents
//   and children alike) gets its own angular slot, and they all share one radial
//   band. Relation → kind: X.flatten/juxtapose → distribute; Y.align/within →
//   align. The nested distributes-on-θ compose into a single flat angular
//   sequence (the bottom-up "flatten"): each node tiles one wedge of the disc.
//
// EMBEDDED-DIMENSION WEDGE. Each node is a rect whose θ-dimension (width, emX)
// is measured in radians so it SWEEPS an arc, and whose r-dimension (height,
// emY) is a radial band. thetaPerNode = 2π / N_total tiles the full circle when
// summed by the edge-mode θ-distribute (spacing 0). RootHeight:rdepth → height
// grows with reverse-depth (d.height): the root is the tallest wedge (reaching
// furthest), leaves the shortest. Color:depth → byDepth() ramp, root darkest.
//
// NOW EXPRESSIBLE (parameterized polar(), #620):
//  - InnerRadius: 0.72 — APPLIED via `polar({ innerRadius: 0.72 })`. The disc is
//    hollow from r=0 to r=0.72·R and the wedges live in the outer rim — the true
//    clock face the dsl asks for. This was the single biggest fidelity gap and is
//    now closed.
//  - StartAngle / Direction / CentralAngle: polar() now takes startAngle,
//    direction, and centralAngle knobs. We keep the defaults here (12-o'clock
//    start, clockwise, full 2π) — the GoTree StartAngle:0.01 uses a different
//    zero/winding convention, and the default already reads as a clock face.
//
// REMAINING GAPS (flagged, not faked):
//  - NO angular auto-fit: angle is NOT allocated by the layout engine from the
//    node count. thetaPerNode is hand-set to 2π / N_total and summed by
//    edge-distribute. In practice the realized sweep falls SHORT of the full 2π
//    (the rim is a partial fan, not a closed ring — visible above) — the nested
//    distribute layers don't sum their angular bounding boxes to exactly
//    N·thetaPerNode, so without an auto-fit pass the wedges under-fill the
//    circle. A different node count or width would instead overflow and wrap.
//    GoTree allocates angle automatically; gofish-gotree has no such pass (#618).
//  - bottom-up Mode / Root within/bottom alignment: the dsl pins the rim to the
//    OUTER edge and grows RootHeight inward. We can only align r (middle here),
//    so wedges are centered on the shared band, not edge-anchored to a rim.
//  - GoFish polar() has no θ/r axis swap (no transposed variant), so the
//    PolarAxis swap is not expressible; not needed here.
//  - Link is "none" in the dsl (a clock face has no connecting edges) — correct
//    here; nothing to draw.
const meta: Meta = { title: "GoTree / Gallery / ClockTree" };
export default meta;

// A moderately bushy tree so the rim is densely populated (like the reference,
// ~30 wedges of varying depth-color). thetaPerNode is derived from the live
// node count below so the wedges tile the full circle exactly.
const clockTree = {
  name: "root",
  children: [
    { name: "A", children: [{ name: "A1" }, { name: "A2" }, { name: "A3" }] },
    {
      name: "B",
      children: [
        { name: "B1" },
        {
          name: "B2",
          children: [{ name: "B2a" }, { name: "B2b" }, { name: "B2c" }],
        },
        { name: "B3" },
      ],
    },
    { name: "C", children: [{ name: "C1" }, { name: "C2" }] },
    {
      name: "D",
      children: [
        { name: "D1" },
        { name: "D2", children: [{ name: "D2a" }, { name: "D2b" }] },
        { name: "D3" },
        { name: "D4" },
      ],
    },
    { name: "E", children: [{ name: "E1" }, { name: "E2" }, { name: "E3" }] },
  ],
};

const bandUnit = 26; // radial thickness unit; node height = (rdepth+1)*bandUnit

// Wedge node: thetaSize is a unit angular WEIGHT (every node an equal slot). The
// coord is the single σ-scale-root: it sums the weights (N·σ) and fits them to
// the angular budget, propagating one σ down through the nested distributes — so
// the ring closes exactly with NO hand-set 2π/N. emX/emY make θ sweep an arc and
// r a radial band. RootHeight:rdepth → height grows with d.height: root tallest.
const node = (d: any) =>
  rect({
    thetaSize: datum(1),
    h: (d.height + 1) * bandUnit,
    emX: true,
    emY: true,
    fill: byDepth()(d),
    stroke: "white",
    strokeWidth: 1.5,
  });

export const ClockTree: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: "none",
        parentChild: combine({
          // θ: parent and its child-group take adjacent angular slots.
          x: { kind: "distribute", spacing: 0, mode: "edge" },
          // r: parent and group share the radial band.
          y: { kind: "align", alignment: "middle" },
        }),
        sibling: combine({
          // θ: siblings tile angularly (edge mode sums θ-widths).
          x: { kind: "distribute", spacing: 0, mode: "edge" },
          // r: siblings share the same radial band.
          y: { kind: "align", alignment: "middle" },
        }),
        // InnerRadius:0.72 — the hollow clock rim (nodes live in the outer band,
        // the disc is empty from the center out to 0.72·R). Now expressible.
        coord: polar({ innerRadius: 0.72 }),
      },
      { w: 540, h: 540 },
      clockTree
    ),
};
