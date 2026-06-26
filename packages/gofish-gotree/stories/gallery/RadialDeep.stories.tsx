import type { Meta, StoryObj } from "@storybook/html";
import { circle, polar } from "gofish-graphics";
import { tree, combine, perDepth } from "../../src";
import { byDepth } from "../data";
import { initializeContainer } from "../helper";

// GoTree gallery port — radial-deep (deep radial sunburst-family tree).
// dsl: Node=circle, Color=depth, Link=curve, CoordinateSystem=polar.
//   AxisIndependent layout:
//     X (= θ under polar): Root include / Subtree flatten
//     Y (= r under polar): Root juxtapose(0r) / Subtree align(top)
// polar() maps x → θ (radians, 0..2π), y → r (radius). Brief x=θ, y=r:
//   - parentChild distributes on y (radial): parent at inner radius, subtree
//     pushed outward one ring per level → the "deep" radial reading.
//   - siblings distribute on x (angular): spread around the circle.
// Point-like circle nodes ⇒ mode:"center" so spacing is read in domain units
// (radians for θ, r-units for r) and per-node bboxes don't accumulate. Color is
// depth-driven (dark root → light leaves), matching the reference.
//
// NOTES (polar gaps — no hacks, flagged for follow-up):
//  - Link=curve is NOT supported. curve link interpolation is unimplemented, so
//    we fall back to {route:"straight"} straight spokes. The reference's
//    gentle radial curves are therefore drawn as straight radial lines.
//  - NO angular auto-fit. Sibling angular spacing is NOT derived from the
//    subtree leaf-count the way GoTree allocates angle (outer ring exactly fills
//    2π). The best we can do with the allowed primitives is hand-taper the
//    per-depth constant via perDepth() (root spokes ≈ 2π/10, then geometric
//    shrink so deeper leaf-fans stay tight) — a manual stand-in for real angular
//    auto-fit. A wider/deeper tree would still overflow the 2π budget and wrap.
//  - polar() takes NO options: InnerRadius, Direction, CentralAngle, and the
//    PolarAxis θ/r swap from the dsl are not expressible.
//  - LinkWidth=depth / Thickness=depth (Min 1, Max 9) is not expressible on the
//    link mark; links use a single fixed strokeWidth.

// A deep tree (4 levels) — the "deep" in radial-deep. Branching thins with depth
// so the outer rings stay (mostly) within the 2π angular budget.
const deepTree = (() => {
  const make = (branch: number[], prefix: string): any => {
    if (branch.length === 0) return { name: prefix };
    const [b, ...rest] = branch;
    return {
      name: prefix,
      children: Array.from({ length: b }, (_, i) =>
        make(rest, `${prefix}-${i}`)
      ),
    };
  };
  // root → 10 spokes → 2 → 2  (1 + 10 + 20 + 40 = 71 nodes, 4 levels)
  return make([10, 2, 2], "r");
})();

// circle nodes, depth-colored (StaticSize 10 → r ~5).
const node = (d: any) =>
  circle({ r: 5, fill: byDepth()(d), stroke: "#1f3a5f", strokeWidth: 1 });

export const RadialDeep: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Radial Deep Tree",
      description:
        "A deep radial node-link tree fanning many hierarchy levels outward from the center.",
    },
  },
  render: () => {
    const container = initializeContainer({ w: 520, h: 520 });
    tree(
      {
        node,
        // NOTE: dsl asks for curve links; curve interpolation unimplemented →
        // linear fallback (straight radial spokes).
        link: { route: "straight", stroke: "#5f6b7a", strokeWidth: 2 },
        parentChild: combine({
          // θ: parent centered over its subtree's angular span.
          x: { kind: "align", alignment: "middle" },
          // r: parent inner, children one ring outward (spacing in r-units).
          y: {
            kind: "distribute",
            spacing: 60,
            mode: "center",
            alignment: "middle",
          },
        }),
        // θ: spread siblings angularly. No angular auto-fit, so hand-taper the
        // per-depth spacing (manual stand-in): 2π/10 at the root so the 10 spokes
        // fill the circle, then geometric shrink so deep leaf-fans stay tight.
        sibling: perDepth((depth: number) =>
          combine({
            x: {
              kind: "distribute",
              spacing: ((2 * Math.PI) / 10) * Math.pow(0.45, depth),
              mode: "center",
              alignment: "middle",
            },
            y: { kind: "align", alignment: "middle" },
          })
        ),
        coord: polar(),
      },
      deepTree
    ).render(container, { w: 520, h: 520 });
    return container;
  },
};

const meta: Meta = {
  title: "GoTree / Gallery / radial-deep",
};
export default meta;
