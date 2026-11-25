import type { Meta, StoryObj } from "@storybook/html";
import { rect, datum, Coord } from "gofish-graphics";
import { combine, byDepth, mount, sampleTree } from "./_shared";

// GoTree gallery port — TornadoTree (one thin arc per node, winding outward
// into a spiral; the root is the outer full circle).
// dsl: AxisIndependent, bottom-up.
//   X: Subtree flatten, Root juxtapose
//   Y: Subtree flatten (Margin -0.46, space-between), Root include
//   CoordinateSystem polar, PolarAxis x-axis, PolarCenter right.
//   Element: Node rectangle, Color depth.
//
// PolarAxis: x-axis puts the layout's X on the RADIUS and its Y on the ANGLE.
// GoFish's polar always reads x as θ and y as r, so the port writes the X
// relations on `y` and the Y relations on `x`:
//   - r (dsl X): every node gets its own radius. Parent and child group are
//     juxtaposed bottom-up, the parent OUTSIDE (the parentChild distribute runs
//     in reverse), and siblings follow one another outward. The root is the
//     outer arc.
//   - θ (dsl Y): a parent's arc spans its children's (include → nest), and
//     siblings follow one another around the angle (flatten → distribute).
// Because the radius and the angle both advance from one sibling to the next,
// the arcs wind around as they move out: the spiral.
//
// SIZES. Leaves carry a unit θ weight and internal nodes none (nest grows each
// to its children's arc); every node is one radial unit thick. The coord fits
// both, so the root closes into the rim.
//
// NOTES:
//  - Y Subtree Margin -0.46 (space-between): GoTree overlaps each sibling with
//    the one before it by 46% of its length, which winds the spiral tighter.
//    GoFish has no negative gap measured in the children's own size (a box
//    gap is pixels, a percent of the room, or a non-negative `fr`), so the
//    siblings here only touch and the spiral makes about one turn.
//  - PolarCenter: right decides which end of the X axis is the pole; the
//    reference has the root on the rim, which the reverse order gives
//    (TornadoTree2, PolarCenter: left, has the root at the pole).
const meta: Meta = { title: "GoTree / Gallery / TornadoTree" };
export default meta;

const node = (d: any) =>
  d.height === 0
    ? rect({ w: datum(1), h: datum(1), fill: byDepth()(d) })
    : rect({ h: datum(1), fill: byDepth()(d) });

export const TornadoTree: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: "none",
        parentChild: combine({
          // θ: the parent's arc spans its subtree's (Root include).
          x: { kind: "nest", pad: 0 },
          // r: the child group, then the parent outside it (bottom-up).
          y: { kind: "distribute", spacing: 4, order: "reverse" },
        }),
        sibling: combine({
          // θ: siblings follow one another around the angle.
          x: { kind: "distribute", spacing: 0 },
          // r: and outward.
          y: { kind: "distribute", spacing: 4 },
        }),
        coord: Coord.clock(),
      },
      { w: 540, h: 540 },
      sampleTree
    ),
};
