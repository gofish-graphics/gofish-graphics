import type { Meta, StoryObj } from "@storybook/html";
import { ellipse, connect, Layer, Frame, polar } from "gofish-graphics";
import { initializeContainer } from "../helper";
import { flareVis, type FlareNode } from "./_flareVis";

// GoTree gallery port — RadialTreeIncline (a radial node-link tree with a
// pinwheel "incline": every parent leans off to one side of its own subtree).
//
// NOTES — data-position layout (per issue #627):
//   Like the sibling RadialDeep story, this BYPASSES the gotree tree()/combine()
//   DSL for node placement. GoTree's adaptive angular allocation (angle by
//   subtree leaf count) plus its off-center parent placement can't be expressed
//   with today's constraint primitives, so a small story-local data pass
//   computes each node's polar position directly and we place marks explicitly
//   inside a Frame({ coord: polar() }).
//
//   Decoded dsl (RadialTreeIncline.dsl.json): Node=circle, Link=straight,
//   Color=depth, CoordinateSystem=polar (x→θ, y→r), Mode bottom-up.
//     - X.Subtree Relation "flatten", Margin "-0.13w", MarginType
//       "space-between": bottom-up box packing on the global angular axis, but
//       with a NEGATIVE margin dealt out only BETWEEN children (s−1 gaps, no
//       flanking gaps — contrast RadialDeep's space-around). A leaf's box is 1
//       unit; an internal box is boxWidth = Σ(child boxWidths) / (1 − m) with
//       m = −0.13, so the box is SMALLER than its content (1.13× the box) and
//       the per-gap slack m·w/(s−1) is NEGATIVE. Sibling leaves therefore
//       OVERLAP like stacked coins inside a compressed fan — exactly the
//       reference's coin-stack fans (node size never feeds back into layout,
//       an artifact faithfully reproduced).
//     - X.Root Relation "juxtapose" → THE INCLINE. A parent is NOT centered
//       over its subtree box; it is placed BESIDE it, at the box's LEADING
//       edge (θ = boxLeft), while the children still fill the whole box
//       (boxLeft … boxLeft + w). So every parent sits at one corner of its fan
//       and the parent→child edges spray out to one side — the slanted spokes
//       and pinwheel lean. Because each node lands at its box's leading edge,
//       the angular gap to the next sibling equals that node's own box width, so
//       a wide (many-leaf) subtree opens a wide gap that its own fan fills —
//       the reference's UNEVEN spoke spacing. With m = 0 and the parent at box
//       center this reduces exactly to RadialDeep.
//     - θ(node) = 2π · (its box leading edge or center) / rootBoxWidth in RAW
//       RADIANS; r(node) = depth · RING_SPACING in RAW PIXELS (Y.Root juxtapose
//       Margin 0.2 → plain concentric rings; leaves share the outer ring, dsl
//       Y.Subtree align top). Plain numbers bypass GoFish's scale machinery
//       (no posScale/domain work) — the "simple thing for now" #627 calls for.
//
//   Follow-up (not blocking): compiling these flatten-θ point layouts down to
//   real fields/scales (so the DSL can express both the adaptive allocation and
//   the off-center juxtapose placement) is future work.
//
//   Links: the dsl asks for STRAIGHT links, and here a `linear` connect resamples
//   cleanly into the near-straight slanted spokes seen in the reference (no curve
//   interpolation needed — that story is RadialDeep's, tracked for PR #637).
//   Link width is UNIFORM (dsl Thickness=static, StaticThickness=3), unlike
//   RadialDeep's depth taper. Links are drawn between explicit zero-size point
//   anchors — this pass knows every coordinate, so no name/ref plumbing. Root→
//   child spokes start from a center anchor carrying the CHILD's angle so each
//   spoke is a straight radial line; a `linear` connect from the root's own
//   angle would spiral outward.

// ---- data-position layout ------------------------------------------------

type Placed = {
  path: string;
  depth: number;
  theta: number; // radians
  r: number; // pixels
  parentPath: string | null;
};

// Reference proportions at 520×520: node diameter ≈ 4% of the canvas → radius
// ~11px; two rings at ~118px so the outer (leaf) ring sits near ±236px.
const NODE_R = 11;
const RING_SPACING = 120;
// GoTree's X.Subtree flatten Margin, MarginType "space-between": the box packs
// so Σ(childWidths) = (1−m)·subtreeWidth. m is NEGATIVE (dsl "-0.13w"), so each
// internal box is SMALLER than its content and the between-child gaps go
// negative — sibling leaves overlap into the coin-stack fans of the reference.
const SUBTREE_MARGIN = -0.13;
// X.Root juxtapose — the incline. A parent sits at fraction PARENT_POS of its
// own box (0 = leading edge, 0.5 = centered like RadialDeep). Leading-edge
// placement throws the whole fan to one side, producing the slanted spokes.
const PARENT_POS = 0;

const layout = (root: FlareNode): Placed[] => {
  const m = SUBTREE_MARGIN;

  // Bottom-up: a leaf's box is 1 unit; an internal box is Σ(children)/(1−m).
  // With m < 0 the box is narrower than its content, so children must overlap.
  const boxWidth = (n: FlareNode): number =>
    n.children?.length
      ? n.children.reduce((s, c) => s + boxWidth(c), 0) / (1 - m)
      : 1;
  const rootWidth = boxWidth(root);

  const placed: Placed[] = [];

  // Top-down: pack each node's children left-to-right inside its box,
  // space-between (gaps only BETWEEN children, s−1 of them), and place the node
  // itself at its box's leading edge (the incline). content + (s−1)·gap = w.
  const walk = (
    n: FlareNode,
    depth: number,
    path: string,
    parentPath: string | null,
    boxLeft: number
  ): void => {
    const w = boxWidth(n);
    placed.push({
      path,
      depth,
      theta: ((boxLeft + PARENT_POS * w) / rootWidth) * 2 * Math.PI,
      r: depth * RING_SPACING,
      parentPath,
    });
    const kids = n.children ?? [];
    if (!kids.length) return;
    // space-between: total slack m·w spread over s−1 inter-child gaps (negative
    // when m < 0, so consecutive children overlap). One child ⇒ no gap.
    const gap = kids.length > 1 ? (m * w) / (kids.length - 1) : 0;
    let cursor = boxLeft;
    kids.forEach((c, i) => {
      walk(c, depth + 1, `${path}/${i}`, path, cursor);
      cursor += boxWidth(c) + gap;
    });
  };

  walk(root, 0, "root", null, 0);
  return placed;
};

const placed = layout(flareVis);
const byPath = new Map(placed.map((p) => [p.path, p]));

// Uniform link width (dsl Thickness=static, StaticThickness=3): straight gray
// spokes at one weight, no depth taper.
const LINK_WIDTH = 2;

// Three depth shades sampled from the reference (dark root → pale leaves).
const DEPTH_COLORS = ["#1a63a8", "#6f9fd0", "#cfe0f2"];

// ---- marks ----------------------------------------------------------------

// A point-ellipse's polar center is (min + w/2, min + h/2) in COORD units and
// its screen radius is w/2 — the two are coupled. Placing `min` at (θ − R, r −
// R) lands the center EXACTLY on (θ, r) for any node size, so links (drawn
// between node centers) meet nodes cleanly regardless of the node's diameter.
const nodeMark = (p: Placed) =>
  ellipse({
    x: p.theta - NODE_R,
    y: p.r - NODE_R,
    w: NODE_R * 2,
    h: NODE_R * 2,
    fill: DEPTH_COLORS[Math.min(p.depth, DEPTH_COLORS.length - 1)],
    stroke: "white",
    strokeWidth: 2.25,
  });

// Fixed-size circle nodes with white halo strokes so overlapping coins stay
// legible. The root goes LAST so its dark disc paints on top of the spoke
// convergence at dead center.
const nodes = [
  ...placed.filter((p) => p.depth > 0),
  ...placed.filter((p) => p.depth === 0),
].map(nodeMark);

// Invisible zero-size point anchor at exact polar coords (center = min, since
// w = h = 0). Used as connect endpoints — since this data pass KNOWS every
// coordinate, links don't need name/ref plumbing at all.
const pt = (theta: number, r: number) =>
  ellipse({ x: theta, y: r, w: 0, h: 0, fill: "none", stroke: "none" });

// Parent→child links between explicit endpoint anchors. fill:"none" so only the
// stroke shows once the segment is resampled by polar.
//
// Root→child spokes start at (θ_child, 0) — the center, but carrying the CHILD's
// angle — so each spoke is a straight radial line (θ constant); a `linear`
// connect from the root's own coords would spiral. Deeper fan links go parent→
// child directly; because the parent sits at its box's leading edge, these
// spray out to one side (the incline).
const links = placed
  .filter((p) => p.parentPath !== null)
  .map((p) => {
    const parent = byPath.get(p.parentPath!)!;
    const src: [number, number] =
      parent.depth === 0 ? [p.theta, 0] : [parent.theta, parent.r];
    return connect(
      {
        mode: "center",
        interpolation: "linear",
        fill: "none",
        stroke: "#57606b",
        strokeWidth: LINK_WIDTH,
      },
      [pt(src[0], src[1]), pt(p.theta, p.r)]
    );
  });

export const RadialTreeIncline: StoryObj = {
  render: () => {
    const container = initializeContainer({ w: 520, h: 520 });
    // Inside a coord, paint order = array order (coord's flattenLayout ignores
    // zOrder — that's resolved by the ROOT bake, and coord is a bake boundary).
    // So links go FIRST in the array to draw under the nodes, and the root node
    // is last within `nodes` so its dark disc caps the spoke convergence.
    Frame({ coord: polar() as any }, [Layer([...links, ...nodes])]).render(
      container,
      { w: 520, h: 520 }
    );
    return container;
  },
};

const meta: Meta = {
  title: "GoTree / Gallery / RadialTreeIncline",
};
export default meta;
