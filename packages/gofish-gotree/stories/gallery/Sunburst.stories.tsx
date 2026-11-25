import type { Meta, StoryObj } from "@storybook/html";
import { rect, datum, Coord } from "gofish-graphics";
import { tree, combine } from "../../src";
import { byDepth } from "../data";
import { initializeContainer } from "../helper";

// GoTree gallery port — sunburst (concentric filled wedges).
// dsl: Element{Node:circle, Color:depth, Link:curve} ; CoordinateSystem polar
//   {Direction:clockwise, PolarAxis:y-axis, InnerRadius:0, StartAngle:0} ;
//   Layout AxisIndependent X{Root:include, Subtree:flatten}
//                          Y{Root:juxtapose, Subtree:align}.
//
// MAPPING. Under polar(): x = θ (radians 0..2π), y = r (radius). Brief mapping:
//   parentChild = (nest θ, distribute r)
//     - nest on θ: parent wedge spans the combined angular extent of its
//       children (X.Root:include → nest). pad 0 → no angular gap, so the
//       parent's arc exactly covers its subtree's arc — the sunburst ring
//       relationship.
//     - distribute on r: parent sits on the inner ring, the child group on the
//       next ring out (Y.Root:juxtapose → distribute), with no gap.
//   sibling = (distribute θ, align r)
//     - distribute on θ: siblings pack angularly, edge mode so each wedge's
//       θ-width (its leaf-count share) is summed → they tile their parent's arc
//       (X.Subtree:flatten → distribute).
//     - align on r: siblings share the same ring (Y.Subtree:align → align).
//
// EMBEDDED-DIMENSION WEDGE. A sunburst wedge SWEEPS through θ, so the node's
// θ-dimension is EMBEDDED in the polar transform: the rect's WIDTH is measured
// in θ-units (a data weight, or unsized), so its width sweeps an arc rather
// than being a flat pixel span. Its r-dimension (height, pixels) is the ring
// thickness. This is the hard "embedded vs non-embedded dimension" case:
//   - LEAVES carry a unit θ weight, `w: datum(1)`.
//   - INTERNAL nodes get NO width — nest grows the parent's θ-width to its
//     children's combined extent. Both sizes are lengths of the polar space,
//     so the rect lives in it.
// The coord fits the summed leaf weights to the full turn, so the disc closes
// for any tree with no hand-set angle.
//
// RINGS. The dsl's Y.Root juxtapose has Margin "0rr": each ring touches the
// one inside it, and the root is a disc (InnerRadius 0). So the radial
// distribute has no gap. Siblings align on their inner edge ("start" on r),
// which is GoTree's "align the sibling nodes": a sibling with a deeper subtree
// still starts its ring where its siblings start theirs.
//
// NOTES:
//  - Direction clockwise and StartAngle 0 are `Coord.clock()`.
//  - Link:curve — a filled-wedge sunburst draws no links (link:"none").
//  - Node:circle in the dsl, but the reference (and a real sunburst) is filled
//    arc wedges — we render rect wedges, matching the visual reference.
//  - The reference draws a real dataset with uneven depth; this story draws a
//    balanced binary tree, so its wedges are even.
const meta: Meta = {
  title: "GoTree / Gallery / sunburst",
};
export default meta;

// Balanced binary tree, 4 levels deep → 16 leaves, so wedge widths divide the
// disc evenly (each internal node has exactly 2 children).
const deepBalancedTree = (() => {
  const make = (depth: number, prefix = ""): any =>
    depth === 0
      ? { name: prefix }
      : {
          name: prefix || "root",
          children: [
            make(depth - 1, prefix + "L"),
            make(depth - 1, prefix + "R"),
          ],
        };
  return make(4);
})();

const bandHeight = 42; // radial thickness of one ring

// Wedge node: leaves carry a unit angular WEIGHT (`w`, the θ extent) that the coord sums
// and fits to the budget; internal nodes leave θ unsized so nest grows them to
// their children's combined arc. Both sweep an arc on θ, and r (pixels) is the
// ring thickness. No hand-set 2π/N — the ring auto-fits.
const node = (d: any) =>
  d.height === 0
    ? rect({
        w: datum(1),
        h: bandHeight,
        fill: byDepth()(d),
        stroke: "white",
        strokeWidth: 1.5,
      })
    : rect({
        h: bandHeight,
        fill: byDepth()(d),
        stroke: "white",
        strokeWidth: 1.5,
      });

export const Sunburst: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Sunburst",
      description:
        "A sunburst diagram drawing the hierarchy as nested arc wedges radiating from the root.",
    },
  },
  render: () => {
    const container = initializeContainer();
    tree(
      {
        node,
        link: "none",
        parentChild: combine({
          // θ: parent wedge encloses its subtree's arc (pad 0 → exact tiling).
          x: { kind: "nest", pad: 0 },
          // r: parent inner ring, child group on the next ring out.
          y: { kind: "distribute", spacing: 0 },
        }),
        sibling: combine({
          // θ: siblings tile their parent's arc (edge mode sums θ-widths).
          x: { kind: "distribute", spacing: 0 },
          // r: siblings start on the same ring (their inner edges align).
          y: { kind: "align", alignment: "start" },
        }),
        coord: Coord.clock(),
      },
      deepBalancedTree
    ).render(container);
    return container;
  },
};
