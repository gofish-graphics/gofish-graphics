import type { Meta, StoryObj } from "@storybook/html";
import { rect, datum, Coord } from "gofish-graphics";
import { tree, combine } from "../../src";
import { byDepth } from "../data";
import { initializeContainer } from "../helper";

// A balanced binary tree (depth 3 → 8 leaves, 4 levels).
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
const LEVELS = 4; // root + 3 levels

// GoTree gallery port — TyreTree (concentric tyre-like rings of wedges, where a
// parent's wedge *includes* its children radially).
//
// dsl.json:
//   Layout AxisIndependent, Mode bottom-up
//     X.Root = include   → parentChild θ : parent SPANS its children's arc  → nest θ
//     X.Subtree = flatten → sibling θ     : siblings packed around the circle → distribute θ
//     Y.Root = within     → parentChild r : child band lies WITHIN the parent's → align r
//     Y.Subtree = align   → sibling r      : siblings share the same band → align r
//   CoordinateSystem polar, PolarCenter bottom, InnerRadius 0.25
//   Element Node=rectangle, RootWidth=value, RootHeight=rdepth, Color=depth
//
// Under polar(): x = θ, y = r. So parentChild = (nest θ, align r) and
// sibling = (distribute θ, align r).
//
// HOW THE TYRE FORMS. Every node is CENTERED on the same radius ("within"),
// and its radial thickness is its reverse depth (RootHeight: rdepth, the number
// of levels from its depth down to the deepest one). The root is the thickest
// wedge; each child group is drawn on top of its parent and is one level
// thinner, so the parent shows as a band on BOTH sides of it: the root is the
// dark rim outside and the dark ring around the hub, and each depth-1 wedge
// shows inside and outside its leaves. This is the reference picture.
//
// SIZES. Leaves carry a unit θ weight and internal nodes none (nest grows each
// to its children's arc); every node carries its rdepth as a radial weight. The
// coord fits both to the room between the hub and the rim.
//
// NOTES:
//  - PolarCenter "bottom" is a polar-space anchor, which polar()'s screen-space
//    `center` does not cover; the disc stays centered (cosmetic).
//  - RootWidth=value: this tree has no values, so each leaf weighs 1.
//  - Link is "none": a filled-wedge inclusion tree draws no links.
const meta: Meta = {
  title: "GoTree / Gallery / TyreTree",
};
export default meta;

// Sequential blue ramp, dark at the root → light at the leaves. Color = depth.
const tyreBlues = ["#08306b", "#2171b5", "#6baed6", "#c6dbef", "#deebf7"];

// Reverse depth: the root spans every level, a leaf one.
const rdepth = (d: any) => LEVELS - d.depth;

const node = (d: any) =>
  d.height === 0
    ? rect({
        w: datum(1),
        h: datum(rdepth(d)),
        fill: byDepth(tyreBlues)(d),
        stroke: "white",
        strokeWidth: 2,
      })
    : rect({
        h: datum(rdepth(d)),
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
    const container = initializeContainer();
    tree(
      {
        node,
        link: "none",
        // parentChild: nest θ (the parent's arc spans its children's) + align
        // r middle (the child group sits centered WITHIN the parent's band).
        parentChild: combine({
          x: { kind: "nest", pad: 0 },
          y: { kind: "align", alignment: "middle" },
        }),
        // sibling: distribute θ (pack siblings around the circle) + align r
        // middle (siblings share one center radius).
        sibling: combine({
          x: { kind: "distribute", spacing: 0 },
          y: { kind: "align", alignment: "middle" },
        }),
        // InnerRadius:0.25 — the donut hole (tyre hub).
        coord: Coord.clock({ innerRadius: 0.25 }),
      },
      sampleTree
    ).render(container, { w: 560, h: 560 });
    return container;
  },
};
