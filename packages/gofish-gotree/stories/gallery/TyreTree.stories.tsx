import type { Meta, StoryObj } from "@storybook/html";
import { rect, polar } from "gofish-graphics";
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
//  - polar() takes NO options, so several dsl knobs are NOT expressible:
//     · InnerRadius 0.25 — the donut hole is NOT achievable. With align-r at the
//       inner edge (r=0) the innermost leaf wedges reach the center, giving a
//       SOLID disc instead of the dsl's 25%-radius hole. (Our wedges leave only
//       a tiny accidental hole at the exact center where r→0 / strokes meet.)
//     · PolarCenter "bottom" — polar() always centers the disc; no off-center pin.
//     · Direction / StartAngle / CentralAngle — fixed full 2π sweep from a fixed
//       start angle; no clockwise/CCW or sub-circle arc.
//     · no θ/r axis swap (no transposed variant; PolarAxis swap not expressible).
//  - NO angular auto-fit: there is no leaf-count allocation pass, so the angular
//    budget is hand-set via leafTheta = 2π / totalLeaves. If that sum drifts from
//    2π the wedges overflow and wrap. Here sampleTree's 8 leaves make each ring
//    sum to exactly 2π.
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

// totalLeaves drives the angular budget so every ring sums to exactly 2π.
// Balanced depth-3 binary tree → 8 leaves.
const totalLeaves = 8;
const leafTheta = (2 * Math.PI) / totalLeaves; // angular share of one leaf
const band = 34; // radial thickness of one inclusion band

const node = (d: any) =>
  rect({
    // θ-dimension embedded: width = this node's leaf-count share of the circle.
    w: d.width * leafTheta,
    emX: true,
    // r-dimension embedded: rdepth → (height + 1) bands, so the parent's wedge
    // is radially taller than (and thus encloses) its children's.
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
        // parentChild: the dsl's X.Root=include is conceptually a nest on θ, but
        // the node's EMBEDDED width (value share) already carries the parent's
        // full subtree arc — so a literal nest-θ double-counts the span and
        // overflows the 2π budget (wedges wrap). Following the IciclePlot port,
        // align θ "middle" centers the parent over its subtree and the embedded
        // width realizes the inclusion. align r "start" pins every node's INNER
        // edge to the same radius, so the taller (lower-depth) wedge reaches
        // OUTWARD past its children — the radial "within" inclusion that makes
        // the root the outer rim.
        parentChild: combine({
          x: { kind: "align", alignment: "middle" },
          y: { kind: "align", alignment: "start" },
        }),
        // sibling: distribute θ (pack siblings around the circle) + align r
        // "start" (siblings share the same inner edge / band).
        sibling: combine({
          x: { kind: "distribute", spacing: 0 },
          y: { kind: "align", alignment: "start" },
        }),
        coord: polar(),
      },
      sampleTree
    ).render(container, { w: 560, h: 560 });
    return container;
  },
};
