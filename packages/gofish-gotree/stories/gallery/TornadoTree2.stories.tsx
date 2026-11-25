import type { Meta, StoryObj } from "@storybook/html";
import { rect, datum, Coord } from "gofish-graphics";
import { combine, byDepth, mount, sampleTree } from "./_shared";

// GoTree gallery port — TornadoTree2 (TornadoTree with the pole on the other
// side: the root is a dot at the center and the arcs wind outward from it).
//
// dsl (gallery/TornadoTree2/dsl.json):
//   Layout: AxisIndependent, bottom-up
//   X: Subtree flatten, Root juxtapose
//   Y: Subtree flatten (Margin -0.46, space-between), Root include
//   CoordinateSystem: polar, PolarAxis x-axis, PolarCenter left
//   Element: Node rectangle, Color depth
//
// The layout is TornadoTree's, with the layout's X on the radius and its Y on
// the angle (PolarAxis: x-axis), written as GoFish's y and x. PolarCenter: left
// puts the other end of the X axis at the pole, so here the parent lies INSIDE
// its child group (the parentChild distribute runs forward) and the root sits
// at the center.
//
// NOTES:
//  - Y Subtree Margin -0.46: GoTree overlaps siblings by 46% of their length,
//    which GoFish cannot write (see TornadoTree), so the siblings only touch.
const meta: Meta = { title: "GoTree / Gallery / TornadoTree2" };
export default meta;

const node = (d: any) =>
  d.height === 0
    ? rect({ w: datum(1), h: datum(1), fill: byDepth()(d) })
    : rect({ h: datum(1), fill: byDepth()(d) });

export const TornadoTree2: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: "none",
        parentChild: combine({
          // θ: the parent's arc spans its subtree's (Root include).
          x: { kind: "nest", pad: 0 },
          // r: the parent, then its child group outside it.
          y: { kind: "distribute", spacing: 4 },
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
