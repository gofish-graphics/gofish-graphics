import type { Meta, StoryObj } from "@storybook/html";
import { ellipse, line, Layer, Frame, polar } from "gofish-graphics";
import { initializeContainer } from "../helper";
import { flareVis, type FlareNode } from "./_flareVis";

// GoTree gallery port — RadialTree (shallow radial node-link tree).
//
// NOTES — data-position layout (per issue #627):
//   Like its sibling RadialDeep, this story BYPASSES the gotree tree()/combine()
//   DSL for node placement. GoTree's angular allocation (angle proportional to a
//   subtree's leaf count) can't be expressed with today's constraint primitives,
//   so a small story-local data pass computes each node's polar position and we
//   place marks explicitly inside Frame({ coord: polar() }, ...). See
//   RadialDeep.stories.tsx for the full derivation; the mechanics are identical,
//   only the decoded constants differ.
//
//   Decoded dsl (dsl.json): Node=circle, Link=straight, Color=depth, polar coord
//   with the AxisIndependent layout mapping x→θ, y→r:
//     - X.Root Relation "within" → a parent sits at the ANGULAR CENTER of its
//       subtree's box (centered over its fan).
//     - X.Subtree Relation "flatten", Margin "-0.20w" → bottom-up box packing on
//       the global angular axis: a LEAF box is 1 unit; an INTERNAL box is
//       boxWidth = Σ(child boxWidths) / (1 − m) with m = −0.20. The margin is
//       NEGATIVE here (RadialDeep's was positive), so an internal box is NARROWER
//       than its children's total and the slack is dealt out as NEGATIVE gaps:
//       adjacent children (and adjacent sibling subtrees at every level) overlap
//       slightly in angle. That is what packs the leaf fans tight and lets
//       neighboring fans interleave — the reference's dense "coin-stack" fans.
//     - θ(node) = 2π · (its box center) / rootBoxWidth, in RAW RADIANS; r(node) =
//       depth · RING_SPACING, in RAW PIXELS. Plain numbers bypass GoFish's scale
//       machinery — the "simple thing for now" #627 calls for.
//     - Y.Root juxtapose Margin 0.2 → concentric rings at r = depth · ring; this
//       tree is only two levels deep, so two rings outside the root.
//
//   Node colors: depth-shaded blues (dark root → medium branch → pale leaf),
//   sampled from the reference. Links: dsl Link=straight, StaticThickness 3 →
//   uniform gray strokes (no depth taper, unlike RadialDeep). The dsl asks for a
//   `straight` link and that is exactly what a `linear` connect resamples to
//   under the polar transform, so these are faithful (no curve approximation is
//   needed here, cf. the curve caveat / PR #637 in RadialDeep).
//
//   Links are drawn between explicit zero-size point anchors (this pass knows
//   every coordinate, so no name/ref plumbing). Root→child spokes start from a
//   center anchor carrying the CHILD's angle so each spoke is a straight radial
//   line; a `linear` connect from the root's own angle would spiral outward.

// ---- data-position layout ------------------------------------------------

type Placed = {
  path: string;
  depth: number;
  theta: number; // radians
  r: number; // pixels
  parentPath: string | null;
};

const NODE_R = 13.5;
const RING_SPACING = 130;
// GoTree's X.Subtree flatten Margin, "-0.20w": the solver constraint is
// Σ(childWidths) = (1−m)·subtreeWidth, so an internal box is Σ/(1−m) wide. With
// m NEGATIVE the box shrinks below its children's sum and the (negative) slack
// becomes overlapping gaps flanking each child — tight, interleaving leaf fans.
const SUBTREE_MARGIN = -0.2;

const layout = (root: FlareNode): Placed[] => {
  const m = SUBTREE_MARGIN;

  // Bottom-up: a leaf's box is 1 unit; an internal box is Σ(children)/(1−m).
  const boxWidth = (n: FlareNode): number =>
    n.children?.length
      ? n.children.reduce((s, c) => s + boxWidth(c), 0) / (1 - m)
      : 1;
  const rootWidth = boxWidth(root);

  const placed: Placed[] = [];

  // Top-down: pack each node's children left-to-right inside its box,
  // space-around style (half a gap on each side of every child), and place the
  // node itself at its box center. With m < 0 the gap is negative → overlap.
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
      theta: ((boxLeft + w / 2) / rootWidth) * 2 * Math.PI,
      r: depth * RING_SPACING,
      parentPath,
    });
    const kids = n.children ?? [];
    if (!kids.length) return;
    const gap = (m * w) / kids.length;
    let cursor = boxLeft;
    kids.forEach((c, i) => {
      cursor += gap / 2;
      walk(c, depth + 1, `${path}/${i}`, path, cursor);
      cursor += boxWidth(c) + gap / 2;
    });
  };

  walk(root, 0, "root", null, 0);
  return placed;
};

const placed = layout(flareVis);
const byPath = new Map(placed.map((p) => [p.path, p]));

// dsl Link=straight, StaticThickness 3 → uniform gray strokes.
const LINK_WIDTH = 2.5;

// Three depth shades sampled from the reference (dark root → pale leaves).
const DEPTH_COLORS = ["#1a63a8", "#6f9fd0", "#cfe0f2"];

// ---- marks ----------------------------------------------------------------

// A point-ellipse's polar center is (min + w/2, min + h/2) in COORD units and
// its screen radius is w/2 — the two are coupled. Placing `min` at (θ − R, ρ −
// R) lands the center EXACTLY on (θ, ρ), so links meet nodes cleanly.
const nodeMark = (p: Placed) =>
  ellipse({
    x: p.theta - NODE_R,
    y: p.r - NODE_R,
    w: NODE_R * 2,
    h: NODE_R * 2,
    fill: DEPTH_COLORS[Math.min(p.depth, DEPTH_COLORS.length - 1)],
    stroke: "white",
    strokeWidth: 2.5,
  });

// Overlapping leaf-fan coins stay legible thanks to white halo strokes. The
// root goes LAST so its dark disc paints on top of the spoke convergence.
const nodes = [
  ...placed.filter((p) => p.depth > 0),
  ...placed.filter((p) => p.depth === 0),
].map(nodeMark);

// Invisible zero-size point anchor at exact polar coords (center = min, since
// w = h = 0). Used as connect endpoints.
const pt = (theta: number, r: number) =>
  ellipse({ x: theta, y: r, w: 0, h: 0, fill: "none", stroke: "none" });

// Parent→child links between explicit endpoint anchors. Root→child spokes start
// at (θ_child, 0) — the center, carrying the CHILD's angle — so each spoke is a
// straight radial line. Deeper fan links go parent→child directly.
const links = placed
  .filter((p) => p.parentPath !== null)
  .map((p) => {
    const parent = byPath.get(p.parentPath!)!;
    const src: [number, number] =
      parent.depth === 0 ? [p.theta, 0] : [parent.theta, parent.r];
    return line(
      {
        curve: "straight",
        fill: "none",
        stroke: "#5f6b7a",
        strokeWidth: LINK_WIDTH,
      },
      [pt(src[0], src[1]), pt(p.theta, p.r)]
    );
  });

export const RadialTree: StoryObj = {
  render: () => {
    const container = initializeContainer({ w: 560, h: 560 });
    // Inside a coord, paint order = array order (coord's flattenLayout ignores
    // zOrder — resolved by the ROOT bake, and coord is a bake boundary). Links
    // go FIRST to draw under the nodes; the root node is last within `nodes`.
    Frame({ coord: polar() as any }, [Layer([...links, ...nodes])]).render(
      container,
      { w: 560, h: 560 }
    );
    return container;
  },
};

const meta: Meta = {
  title: "GoTree / Gallery / RadialTree",
};
export default meta;
