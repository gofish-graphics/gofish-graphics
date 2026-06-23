import type { Meta, StoryObj } from "@storybook/html";
import { rect, polar, datum } from "gofish-graphics";
import { tree, combine } from "../../src";
import { byDepth } from "../data";
import { initializeContainer } from "../helper";

// A *balanced* binary tree (depth 3 → 8 leaves, 4 levels). Balance matters: with
// align-r the radial bands only line up into clean concentric rings when every
// leaf sits at the same depth. An UNEVEN tree (mixed leaf depths) under align-r
// makes the radial domain inconsistent across subtrees and the angular budget
// overflows 2π, so the outer wedges wrap into a spiral — a real limitation of
// the no-auto-fit polar() (see NOTES). 8 leaves → leafTheta = 2π/8 ties out.
const sampleTree = (() => {
  const make = (depth: number, prefix = "root"): any =>
    depth === 0
      ? { name: prefix }
      : {
          name: prefix,
          children: [
            make(depth - 1, prefix + "L"),
            make(depth - 1, prefix + "R"),
          ],
        };
  return make(3);
})();

// GoTree gallery port — TyreTree (concentric tyre-like rings of wedges, where a
// parent's wedge *includes* its children radially: the outermost ring is the
// root, and each level nests one band further toward the center).
//
// dsl.json:
//   Layout AxisIndependent, Mode bottom-up
//     X.Root = include   → parentChild θ : parent SPANS its children's arc  → nest θ
//     X.Subtree = flatten → sibling θ     : siblings packed around the circle → distribute θ
//     Y.Root = within     → parentChild r : child band lies WITHIN the parent's → align r
//     Y.Subtree = align   → sibling r      : siblings share the same radial edge → align r
//   CoordinateSystem polar, PolarCenter bottom, InnerRadius 0.25
//   Element Node=rectangle, RootWidth=value, RootHeight=rdepth, Color=depth
//
// Under polar(): x = θ (radians, 0..2π), y = r (radius). So the brief mapping is
//   parentChild = (nest θ, align r) ; sibling = (distribute θ, align r).
//
// ── HOW THE TYRE FORMS (the "inclusion" of the dsl) ──────────────────────────
// Unlike the sunburst/icicle (where each depth gets its OWN ring via distribute-r),
// here every node is ALIGNED on r at the same INNER edge and its radial height
// encodes its reverse-depth (rdepth = d.height in d3-hierarchy = edges to the
// deepest descendant). A node at rdepth k spans (k + 1) bands OUTWARD from the
// shared inner edge:
//   - root        → tallest wedge, reaches from the inner edge all the way out;
//   - its children → shorter, drawn ON TOP, covering the inner bands;
//   - leaves      → one band, innermost (drawn last, on top).
// Because the recursion paints the parent first and the child group on top
// (renderSubtree → parentChild([parent, childGroup])), each shallower level is
// progressively overpainted toward the center, leaving the outer rim showing
// only the root, the next band in root+depth-1, and so on — the concentric
// "tyre". That radial inclusion is exactly the dsl's Y.Root=within / X.Root=
// include pair (parent's wedge spatially CONTAINS its subtree's).
//
// ── EMBEDDED-DIMENSION WEDGE (the hard part) ─────────────────────────────────
// A wedge SWEEPS in θ, so the θ-dimension is embedded in the node's width:
//   w = d.width * leafTheta   with emX:true   (d.width = leaf count from d3-hierarchy)
//   h = (d.height + 1) * band with emY:true   (rdepth → radial extent, leaves ≥1 band)
// emX/emY tell gofish the rect's width/height are measured in the transform's
// DOMAIN units (radians for θ, r-units for r), not pixels. Because each node's
// angular width is its leaf-count share, a parent's width equals the sum of its
// children's widths automatically — so nest-θ (pad 0) and the embedded width
// agree, and the parent wedge spans exactly its subtree's arc (RootWidth=value).
//
// ── POLAR LIMITATIONS (no hacks; flagged, not faked) ─────────────────────────
//  - InnerRadius 0.25 — APPLIED via `polar({ innerRadius: 0.25 })`: the donut
//    hub. The concentric depth bands now ring a 25%-radius hollow center instead
//    of filling to r=0 (the headline "tyre" gap, now closed).
//  - Still NOT expressible (flagged, not faked):
//     · PolarCenter "bottom" — polar()'s `center` is a screen-space offset, not a
//       semantic "bottom" pin; left centered here (cosmetic).
//     · Direction / StartAngle / CentralAngle — polar() now has these knobs but
//       this chart's spec only customizes InnerRadius; kept at defaults.
//     · no θ/r axis swap (no transposed variant; PolarAxis swap not expressible).
//  - Angular AUTO-FIT (#618): leaves carry a unit thetaSize weight, nest-θ grows
//    each parent to its children's arc, and the coord fits the summed weights to
//    the circle — so the disc closes for any tree with no hand-set leafTheta.
//  - REQUIRES a depth-balanced tree: align-r needs every leaf at the same depth
//    so the radial bands line up. A mixed-depth tree makes the per-subtree r
//    extents disagree and the angular budget overflows 2π (outer wedges spiral).
//    The dsl's bottom-up adaptive layout would absorb that; our hand-budgeted
//    polar() cannot, so we use a balanced tree (see sampleTree above).
//  - Link is "none": a filled-wedge inclusion tree draws no links (the dsl has no
//    link element either); polar links only support linear interpolation anyway.
const meta: Meta = {
  title: "GoTree / Gallery / TyreTree",
};
export default meta;

// Sequential blue ramp, dark at the root (outer rim) → light at the leaves
// (inner), matching the reference. Color = depth.
const tyreBlues = ["#08306b", "#2171b5", "#6baed6", "#c6dbef", "#deebf7"];

const band = 34; // radial thickness of one inclusion band

// θ auto-fit (#618): leaves carry a unit angular weight; internal nodes leave θ
// unsized so nest-θ grows each to its children's combined arc (no double-count —
// only leaves are sized). The coord fits the summed leaf weights to the circle.
// r-dimension embedded: rdepth → (height+1) bands, so a parent's wedge is taller
// than (and, pinned to the same inner edge via align-r start, encloses) its
// children's.
const node = (d: any) =>
  d.height === 0
    ? rect({
        thetaSize: datum(1),
        emX: true,
        h: (d.height + 1) * band,
        emY: true,
        fill: byDepth(tyreBlues)(d),
        stroke: "white",
        strokeWidth: 2,
      })
    : rect({
        emX: true,
        h: (d.height + 1) * band,
        emY: true,
        fill: byDepth(tyreBlues)(d),
        stroke: "white",
        strokeWidth: 2,
      });

export const TyreTree: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Tyre Tree",
      description:
        "A tyre tree of concentric wedge rings, each ring a level of the hierarchy around a central hub.",
    },
  },
  render: () => {
    const container = initializeContainer({ w: 560, h: 560 });
    tree(
      {
        node,
        link: "none",
        // parentChild: nest θ realizes the dsl's X.Root=include (parent's arc
        // spans its children's). Only LEAVES are θ-sized (unit weight); internal
        // nodes are unsized so nest grows them to the subtree arc — no double-
        // count. align r "start" pins every node's INNER edge to the same radius,
        // so the taller (lower-depth) wedge reaches OUTWARD past its children —
        // the radial "within" inclusion that makes the root the outer rim.
        parentChild: combine({
          x: { kind: "nest", pad: 0 },
          y: { kind: "align", alignment: "start" },
        }),
        // sibling: distribute θ (pack siblings around the circle) + align r
        // "start" (siblings share the same inner edge / band).
        sibling: combine({
          x: { kind: "distribute", spacing: 0 },
          y: { kind: "align", alignment: "start" },
        }),
        // InnerRadius:0.25 — the donut hole (tyre hub). Now expressible.
        coord: polar({ innerRadius: 0.25 }),
      },
      sampleTree
    ).render(container, { w: 560, h: 560 });
    return container;
  },
};
