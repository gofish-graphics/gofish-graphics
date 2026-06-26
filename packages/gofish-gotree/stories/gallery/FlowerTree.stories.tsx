import type { Meta, StoryObj } from "@storybook/html";
import { circle, polar } from "gofish-graphics";
import { combine, byDepth, mount, sampleTree } from "./_shared";

// GoTree gallery port — FlowerTree (polar circle clusters / "petals").
// dsl: Layout Mode bottom-up; X = { Subtree: flatten, Root: include };
//      Y = { Subtree: align, Root: within }; CoordinateSystem polar;
//      Element { Node: circle, Link: straight }.
//
// Relation → combine kind (see _shared.ts):
//   include → nest ; flatten → distribute ; within/align → align.
// So, decomposing X (=θ under polar) and Y (=r under polar):
//   parentChild = (x: nest,        y: align)   ← Root: include / within
//   sibling     = (x: distribute,  y: align)   ← Subtree: flatten / align
//
// The "flower" comes from `nest` on θ: each parent's angular wedge ENCLOSES
// the angular span of its child group, while `align` on r keeps parent and
// children on the SAME radial band (no radial growth between levels). Parents
// are sized larger than their children (radius scaled by subtree leaf count),
// so a parent circle visibly wraps its cluster of child circles — the petal.
// Siblings distribute angularly (θ spacing in radians) on a shared radius.
//
// POLAR LIMITATIONS (no hacks — flagged):
//  - polar() takes NO options. The dsl's polar defaults (InnerRadius,
//    Direction, CentralAngle, PolarAxis θ/r assignment) are not expressible;
//    x is hard-wired to θ∈[0,2π] and y to r.
//  - NO angular auto-fit. Sibling θ spacing is a fixed per-level constant; it
//    does not shrink with node count, so wide groups can overflow the 2π
//    budget and wrap. GoTree allocates θ by subtree leaf-count; gofish-gotree
//    has no equivalent yet.
//  - `nest` on θ (an embedded/periodic dimension) is geometrically odd: nest's
//    padding is a flat radian pad, not a true wedge inset, and enclosure is
//    only "visible" because parents are hand-sized bigger than children. With
//    a uniform-size node the nest would not read as a petal at all.
//  - Link "straight" maps to route:"straight", but with parentChild
//    aligned on r the parent/child radii coincide, so links are short chords
//    inside each petal rather than radial spokes.
const meta: Meta = { title: "GoTree / Gallery / FlowerTree" };
export default meta;

// Radius scaled by subtree leaf count (d.width) so parents enclose their
// children — the petal. Leaves (width 1) are the small dark dots.
const node = (d: any) =>
  circle({
    r: 6 + Math.sqrt(d.width ?? 1) * 6,
    fill: byDepth()(d),
    stroke: "white",
    strokeWidth: 2,
  });

export const FlowerTree: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: { route: "straight", stroke: "#90a4ae", strokeWidth: 1.5 },
        parentChild: combine({
          // θ: parent wedge encloses (nests) the child group's angular span.
          x: { kind: "nest", pad: 0.04 },
          // r: parent on the same radial band as its children (no growth).
          y: { kind: "align", alignment: "middle" },
        }),
        sibling: combine({
          // θ: spread siblings angularly (spacing in radians, center mode so
          // point-like circles don't accumulate bboxes around the ring).
          x: {
            kind: "distribute",
            spacing: (2 * Math.PI) / 7,
            mode: "center",
          },
          // r: siblings share a radius band.
          y: { kind: "align", alignment: "middle" },
        }),
        coord: polar(),
      },
      { w: 520, h: 520 },
      sampleTree
    ),
};
