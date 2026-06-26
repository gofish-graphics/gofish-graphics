import type { Meta, StoryObj } from "@storybook/html";
import { rect, polar } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — RadialPhylogeneticTree (polar, hidden nodes).
// dsl: Node=hidden, Link=straight, Color=depth, CoordinateSystem=polar,
//   Layout AxisIndependent:
//     X: Root=include   (parentChild → nest)      Subtree=flatten (sibling → distribute)
//     Y: Root=juxtapose (parentChild → distribute) Subtree=align   (sibling → align)
// Under polar(): x = θ (radians, 0..2π), y = r (radius). So the combine brief is:
//   parentChild = (nest θ,        distribute r)
//   sibling     = (distribute θ,  align r)
// Differs from the sibling RadialTree port only in parentChild-x: that one uses
// `align` (parent angularly centered over its subtree); the phylogenetic dsl uses
// `include`/`nest`, so the parent's θ-extent is grown to *wrap* its child group.
//
// node=hidden ⇒ a transparent zero-size rect so links still have an anchor point
// but nothing paints. Color=depth therefore can't live on the (invisible) node —
// it's carried by the links instead (stroke = byDepth(target)), which is also how
// the reference reads (radial spokes, no visible node glyphs).
//
// ─── POLAR GAPS (no hacks; flagged for follow-up) ──────────────────────────────
//  1. nest on θ (x) is the "embedded dimension" hard case. nest grows the parent's
//     angular width to enclose its child group (+pad), so the angular bbox
//     ACCUMULATES up the tree. With no angular auto-fit, that overflows the 2π
//     budget for any non-tiny tree → wedges wrap / overlap. GoTree's polar layout
//     allocates angle by subtree leaf-count; gofish-gotree has none, so spacing is
//     a fixed per-level constant that does not shrink with node count.
//  2. polar() takes no options: the dsl's InnerRadius, Direction, CentralAngle and
//     the PolarAxis θ/r swap are not expressible. Mode=bottom-up is also not
//     expressible (placement is always parent-out here).
//  3. Link=straight → {route:"straight"}; segments curve under the polar
//     transform, which is expected (a straight cartesian edge maps to a polar arc).
//  4. With nest-θ active the parent is no longer a true point, so parentChild-r
//     uses mode:"center" to keep the radial spacing read in r-units (no bbox
//     accumulation on the radial axis); the angular accumulation in (1) remains.
const meta: Meta = { title: "GoTree / Gallery / RadialPhylogeneticTree" };
export default meta;

// Hidden node: transparent, zero-size — links anchor to its center, nothing paints.
const node = (_d: any) => rect({ w: 0, h: 0, fill: "transparent" });

export const RadialPhylogeneticTree: StoryObj = {
  render: () =>
    mount(
      {
        node,
        // Color=depth lives on the link (target depth), since the node is hidden.
        link: (_s: any, t: any) => ({
          route: "straight",
          stroke: byDepth()(t),
          strokeWidth: 1.5,
        }),
        parentChild: combine({
          // θ: nest — parent's angular extent wraps its child group (dsl include).
          x: { kind: "nest", pad: 0 },
          // r: parent inner, children outward (mode center → spacing in r-units).
          y: {
            kind: "distribute",
            spacing: 70,
            mode: "center",
            alignment: "middle",
          },
        }),
        sibling: combine({
          // θ: spread siblings angularly (spacing in radians, center mode).
          x: {
            kind: "distribute",
            spacing: (2 * Math.PI) / 6,
            mode: "center",
            alignment: "middle",
          },
          // r: siblings share a radius (dsl align).
          y: { kind: "align", alignment: "middle" },
        }),
        coord: polar(),
      },
      { w: 480, h: 480 }
    ),
};
