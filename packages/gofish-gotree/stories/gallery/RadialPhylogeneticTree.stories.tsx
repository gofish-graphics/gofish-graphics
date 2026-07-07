import type { Meta, StoryObj } from "@storybook/html";
import { ellipse, connect, Layer, Frame } from "gofish-graphics";
import { initializeContainer } from "../helper";
import { flareVis, type FlareNode } from "./_flareVis";

// GoTree gallery port — RadialPhylogeneticTree (polar radial dendrogram).
//
// NOTES — data-position layout (per issue #627):
//   Like the sibling RadialDeep port, this story intentionally BYPASSES the
//   gotree tree()/combine() DSL for node placement and instead runs a small
//   story-local data pass that computes each node's polar position directly,
//   then places marks inside Frame({coord: polar()}, ...). GoTree's polar
//   angular allocation (dsl X: Root=include / Subtree=flatten) allots angle by
//   subtree leaf-count, which the constraint primitives can't express today
//   (the old tree()/combine() version wrapped into an illegible blob because
//   its per-level radian spacing didn't shrink with node count).
//
//   Decoded dsl (RadialPhylogeneticTree/dsl.json):
//     Node=hidden (NO node glyphs — links only), Link=straight,
//     LinkWidth=depth (StaticThickness 2), Color=depth, coord=polar (x→θ, y→r),
//     Mode=bottom-up, Layout AxisIndependent.
//
//   ANGULAR axis (x = θ, radians). X.Subtree Relation="flatten" with NO Margin
//   ⇒ m = 0: pure uniform leaf slots — no space-around inflation (this is the
//   m = 0 special case of RadialDeep's box packing). Every LEAF claims one unit
//   slot; an INTERNAL node's box is just Σ(child boxes); each node sits at its
//   box CENTER. θ(node) = 2π · boxCenter / totalLeaves in RAW RADIANS. Because a
//   fanned-out internal child spans several slots and sits at their center, the
//   ROOT spokes are UNEVENLY spaced — a childless sibling sits one slot from a
//   4-leaf subtree's center — which is exactly the reference's uneven fan. The
//   grandchildren inside one fork stay tight (one slot ≈ 2π/37 apart).
//
//   RADIAL axis (y = r, pixels). The reference is a radial DENDROGRAM: all
//   spokes emanate from the dead center (hidden root at r = 0) and every LEAF
//   sits on the same outer ring (r = LEAF_R), so leaf tips align on a circle.
//   An INTERNAL node sits partway out at r = depth · RING, so its children fork
//   toward the rim. dsl Y.Root juxtapose Margin "0r" + Y.Subtree align gives
//   this ring-by-depth-with-leaves-aligned reading (a literal r = depth · ring
//   would instead strand the 10 leaf-CHILDREN on an inner ring, which the
//   reference PNG does not show — its plain spokes all reach the rim). r is a
//   RAW pixel number, bypassing GoFish's scale machinery — the "simple thing
//   for now" #627 calls for. Follow-up (not blocking): compiling these
//   flatten-θ / leaf-aligned-r point layouts down to real fields/scales so the
//   DSL can express them is future work.
//
//   Links: dsl Link=straight ⇒ straight screen-space edges. GoTree draws every
//   edge (root→child AND fork→leaf) as a straight CHORD. Routing those chords
//   through a Frame({coord: polar()}) — RadialDeep's approach — bows each one
//   into a polar arc (the straight-vs-curved gap RadialDeep leaves to PR #637):
//   fine for its near-radial fans, but here a multi-leaf fork's chord spans
//   enough Δθ that the bow is plainly visible and wrong versus the reference.
//   Since this data pass already knows every position, we instead PROJECT the
//   polar layout to screen — (x,y) = center + r·(cos θ, sin θ) — and draw plain
//   straight connects in a linear frame, honoring Link=straight EXACTLY. The
//   projection is the only reason for the linear frame; the layout model is
//   still polar (θ, r). Link thickness tapers by the PARENT's depth (dsl
//   LinkWidth=depth): root spokes thicker, leaf-fan links thinner.

// ---- data-position layout ------------------------------------------------

type Placed = {
  path: string;
  depth: number;
  theta: number; // radians
  r: number; // pixels
  isLeaf: boolean;
  parentPath: string | null;
};

// Reference proportions (square canvas): leaf tips sit on an outer ring near
// the rim; internal forks sit a little past half radius.
const LEAF_R = 216; // outer ring — every leaf lands here (aligned tips)
const RING = 116; // radius per internal-node depth level (fork radius)

const layout = (root: FlareNode): Placed[] => {
  // Angular box packing, m = 0 (flatten, no margin): a leaf's box is one slot;
  // an internal box is just the sum of its children — no inflation, no gaps.
  const boxWidth = (n: FlareNode): number =>
    n.children?.length ? n.children.reduce((s, c) => s + boxWidth(c), 0) : 1;
  const totalLeaves = boxWidth(root);

  const placed: Placed[] = [];

  // Top-down: pack each node's children left-to-right inside its slot span and
  // place the node itself at its span center. Radius = depth · RING for
  // internal nodes; leaves are pushed out to the shared outer ring LEAF_R.
  const walk = (
    n: FlareNode,
    depth: number,
    path: string,
    parentPath: string | null,
    boxLeft: number
  ): void => {
    const w = boxWidth(n);
    const isLeaf = !n.children?.length;
    placed.push({
      path,
      depth,
      theta: ((boxLeft + w / 2) / totalLeaves) * 2 * Math.PI,
      r: isLeaf ? LEAF_R : depth * RING,
      isLeaf,
      parentPath,
    });
    const kids = n.children ?? [];
    let cursor = boxLeft;
    kids.forEach((c, i) => {
      walk(c, depth + 1, `${path}/${i}`, path, cursor);
      cursor += boxWidth(c);
    });
  };

  walk(root, 0, "root", null, 0);
  return placed;
};

const placed = layout(flareVis);
const byPath = new Map(placed.map((p) => [p.path, p]));

// dsl LinkWidth=depth (StaticThickness 2): root spokes are a touch thicker than
// the outer leaf-fan links — a subtle taper, matching the reference's mostly
// uniform thin spokes.
const linkWidth = (parentDepth: number) => (parentDepth === 0 ? 1.7 : 1.25);

// Plain neutral gray, matching the reference's uniform spokes. dsl Color=depth,
// but the reference reads as a single gray, so depth shading is left flat.
const LINK_COLOR = "#5a5a5a";

// ---- marks ----------------------------------------------------------------

const CANVAS = 500;
const CENTER = CANVAS / 2;

// Project the polar layout (θ, r) to screen. θ = 0 points up; the tree is
// rotationally symmetric so the exact zero-reference is cosmetic.
const project = (theta: number, r: number): [number, number] => [
  CENTER + r * Math.cos(theta - Math.PI / 2),
  CENTER + r * Math.sin(theta - Math.PI / 2),
];

// Node=hidden ⇒ links only, no glyphs. Invisible zero-size point anchor at exact
// screen coords (center = min, since w = h = 0). Used as connect endpoints —
// this data pass KNOWS every coordinate, so links need no name/ref plumbing.
const pt = ([x, y]: [number, number]) =>
  ellipse({ x, y, w: 0, h: 0, fill: "none", stroke: "none" });

// Parent→child links as straight screen chords (dsl Link=straight). Root→child
// starts at the dead center; fork→leaf goes fork point → leaf point directly.
const links = placed
  .filter((p) => p.parentPath !== null)
  .map((p) => {
    const parent = byPath.get(p.parentPath!)!;
    const src: [number, number] =
      parent.depth === 0 ? [CENTER, CENTER] : project(parent.theta, parent.r);
    return connect(
      {
        mode: "center",
        interpolation: "linear",
        fill: "none",
        stroke: LINK_COLOR,
        strokeWidth: linkWidth(parent.depth),
      },
      [pt(src), pt(project(p.theta, p.r))]
    );
  });

export const RadialPhylogeneticTree: StoryObj = {
  render: () => {
    const container = initializeContainer({ w: CANVAS, h: CANVAS });
    // Node=hidden: the layer holds only links.
    Frame({}, [Layer([...links])]).render(container, { w: CANVAS, h: CANVAS });
    return container;
  },
};

const meta: Meta = {
  title: "GoTree / Gallery / RadialPhylogeneticTree",
};
export default meta;
