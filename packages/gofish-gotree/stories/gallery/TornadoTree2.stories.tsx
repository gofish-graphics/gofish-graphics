import type { Meta, StoryObj } from "@storybook/html";
import { rect, polar } from "gofish-graphics";
import { combine, byDepth, mount } from "./_shared";

// GoTree gallery port — TornadoTree2 (a variant of TornadoTree). A radial
// "tornado": every node is a thin arc (rectangle in polar space), and each
// deeper level both twists angularly and grows radially, so the whole tree
// spirals outward from the center.
//
// dsl (gallery/TornadoTree2/dsl.json):
//   Layout: AxisIndependent, bottom-up
//   X: Subtree flatten, Root juxtapose      → distribute on θ
//   Y: Subtree flatten (Margin -0.46), Root include → flatten + radial nest
//   CoordinateSystem: polar, PolarAxis x-axis, PolarCenter left
//   Element: Node rectangle, Color depth
//
// Brief mapping (x = θ, y = r under polar()):
//   node       = rectangle, colored by depth ; link = none
//   parentChild = (distribute θ, nest r)   → each child group is twisted a bit
//                 angularly off its parent and nested radially inside it.
//   sibling     = (distribute θ, distribute r) → siblings fan out on θ AND
//                 step outward on r, which is what produces the spiral.
//
// node = rect colored byDepth. For the radial-nest (y) axis the internal nodes
// are left UNSIZED on r so `nest` can grow them to wrap their subtree; only the
// θ-width is fixed. Leaves carry a fixed r-thickness too.
const LEAF_THETA = 0.12; // angular width of a node (radians)
const LEAF_R = 14; // radial thickness of a leaf (px in r)

const node = (d: any) =>
  d.height === 0
    ? rect({
        w: LEAF_THETA,
        h: LEAF_R,
        emX: true,
        emY: true,
        fill: byDepth()(d),
        stroke: "white",
        strokeWidth: 1,
      })
    : rect({
        // internal node: fixed θ-width, UNSIZED on r so `nest` grows it
        // radially to enclose its subtree.
        w: LEAF_THETA,
        emX: true,
        emY: true,
        fill: byDepth()(d),
        stroke: "white",
        strokeWidth: 1,
      });

const meta: Meta = { title: "GoTree / Gallery / TornadoTree2" };
export default meta;

export const TornadoTree2: StoryObj = {
  render: () =>
    mount(
      {
        node,
        link: "none",
        parentChild: combine({
          // θ: twist the child group off its parent (Subtree flatten on X) — a
          // large per-level twist is what makes successive rings spiral around.
          x: { kind: "distribute", spacing: 0.5, mode: "center" },
          // r: child group nested radially inside the parent (Root include / Y
          // nest). Small pad keeps parent arcs from spiking too far out.
          y: { kind: "nest", pad: 6 },
        }),
        sibling: combine({
          // θ: fan siblings out angularly.
          x: { kind: "distribute", spacing: 0.32, mode: "center" },
          // r: step each sibling outward radially → the spiral.
          y: { kind: "distribute", spacing: 12, mode: "center" },
        }),
        coord: polar(),
      },
      { w: 560, h: 560 }
    ),
};

// NOTES (polar gaps — no hacks, only combine + coord + node factory):
//  - polar() takes NO options, so dsl knobs PolarCenter:"left", InnerRadius,
//    Direction, CentralAngle are NOT expressible — the spiral always centers on
//    the canvas, not offset left as in the reference.
//  - PolarAxis:"x-axis" requests a θ/r axis swap, but gofish polar() has no
//    transposed variant, so it is not expressible; the brief mapping (x→θ, y→r)
//    is used directly.
//  - NO angular auto-fit: θ spacing is a fixed per-level constant and does not
//    shrink with node count, so deep/wide branches overflow the 2π budget and
//    wrap around — this is exactly the "tornado" overflow seen in the gotree
//    reference, but it is uncontrolled rather than algorithmically allocated by
//    subtree leaf-count.
//  - nest-on-r (embedded radial dimension): `nest` grows an internal node's
//    rect on r to wrap its subtree, so parent arcs are radially LONG while
//    leaves are short — a rough approximation of gotree's radial containment.
//    The Margin:"-0.46" space-between overlap from the dsl is not expressible.
//  - The default sampleTree is only 3 levels deep, so the spiral has fewer
//    turns than the deep random tree in the reference image.
