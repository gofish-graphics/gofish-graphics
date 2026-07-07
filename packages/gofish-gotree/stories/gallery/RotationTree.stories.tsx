import type { Meta, StoryObj } from "@storybook/html";
import { ellipse, connect, Layer, Frame, polar } from "gofish-graphics";
import { initializeContainer } from "../helper";
import { flareVis, type FlareNode } from "./_flareVis";

// GoTree gallery port — RotationTree (the radial-collapse "pinwheel").
//
// NOTES — data-position layout (per issue #627), same architecture as the
// sibling RadialDeep.stories.tsx (which decodes GoTree's box-packing math);
// this file only differs in how it maps that packing onto RADIUS and in the
// swirled links.
//
//   THE DECODED RULE — RADIAL COLLAPSE. The dsl is Mode bottom-up, polar,
//   Color=depth, with
//       X (= θ): Root juxtapose / Subtree flatten (Margin 0.1)
//       Y (= r): Root within    / Subtree align
//   Nothing distributes on r: both the root↔subtree (within) and sibling
//   (align) relations ALIGN radially. So every node collapses onto ONE shared
//   radius — with one exception. `within` on the root's Y means the root is
//   laid out INSIDE (concentric with) its subtree's radial extent; with the
//   subtree flattened onto a single ring, "within" pulls the root to the
//   center of the disc (r ≈ 0) while all 46 descendants sit on that one outer
//   ring like a necklace. That center-vs-ring split is the whole gestalt.
//
//   θ is allocated exactly as in RadialDeep: bottom-up space-around box packing
//   on the global angular axis (leaf box = 1 unit; an internal box inflates to
//   Σ(childWidths)/(1−m), the slack dealt out as gaps flanking each child), and
//   θ(node) = 2π · boxCenter / rootBoxWidth in raw radians. m is GoTree's
//   X.Subtree flatten Margin. Because a parent sits at its box CENTER, on the
//   collapsed ring each depth-1 node lands in the ANGULAR MIDDLE of its leaf
//   fan — the necklace reads leaf … parent … leaf, and the depth-1 hubs are
//   the anchors the center spokes swirl out to.
//
//   THE SWIRL-LINK TRICK. The dsl asks for arccurve links (ArcDirection
//   bottom); curved-link interpolation is unimplemented (tracked for PR #637).
//   But under coord(polar()), connect's `curve:"straight"` interpolates
//   in (θ, r) space and ADAPTIVELY RESAMPLES the segment (adaptive-resampling.ts
//   subdivides on the transform's curvature), so a straight (θ,r) segment
//   renders as a smooth screen curve. We exploit that twice:
//     - CENTER → depth-1 hub: the center anchor carries the child's angle plus
//       a constant angular LAG (SWIRL_LAG). At r=0 all angles collapse to the
//       center, but the segment leaves the center pointing at θ+lag and winds
//       back to θ by the ring — an Archimedean spiral. One shared lag sign gives
//       every spoke the same rotational bow: the pinwheel. (Straight radial
//       spokes — the RadialDeep fallback — would kill the "rotation" entirely,
//       so the swirl is essential here, not cosmetic.)
//     - depth-1 hub → depth-2 leaf: a short arc HUGGING the ring, routed through
//       a mid anchor pushed slightly OUTSIDE the ring (RING_BULGE) to reproduce
//       arccurve's outward-bowing petals between a hub and its flanking leaves.
//
//   Approximations / gaps (all inherited or #637): links are gray uniform-width
//   (dsl Thickness=static 2 / LinkWidth=adaptive is a single strokeWidth here);
//   the two-linear-segment ring petals meet at a faint apex corner rather than
//   one true arccurve; and, as in RadialDeep, fixed-radius nodes overlap where a
//   leaf fan is tightly packed (node size never feeds back into the layout — an
//   artifact faithful to the original).

// ---- data-position layout ------------------------------------------------

type Placed = {
  path: string;
  depth: number;
  theta: number; // radians
  r: number; // pixels
  parentPath: string | null;
};

// Reference proportions at 520×520: one outer ring near the canvas edge, the
// dark root alone at dead center.
const NODE_R = 11.5;
const RING_R = 228; // the single shared radius every non-root node collapses to.
// GoTree's X.Subtree flatten Margin (dsl "0.1"): the space-around slack each
// internal box carries. Small margin ⇒ tight leaf fans with modest seam gaps
// between sibling subtrees — the reference's clustered necklace.
const SUBTREE_MARGIN = 0.22;
// Angular lag (radians) the center anchor carries past its hub — the pinwheel
// sweep. Positive winds the spokes one way; flip the sign to mirror the swirl.
const SWIRL_LAG = 1.3;
// How far (px) the ring-petal mid anchor is pushed outside RING_R.
const RING_BULGE = 10;

const layout = (root: FlareNode): Placed[] => {
  const m = SUBTREE_MARGIN;

  const boxWidth = (n: FlareNode): number =>
    n.children?.length
      ? n.children.reduce((s, c) => s + boxWidth(c), 0) / (1 - m)
      : 1;
  const rootWidth = boxWidth(root);

  const placed: Placed[] = [];

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
      // θ from the same box-center packing as RadialDeep …
      theta: ((boxLeft + w / 2) / rootWidth) * 2 * Math.PI,
      // … but r COLLAPSES: root to the center, everyone else to one ring.
      r: depth === 0 ? 0 : RING_R,
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

// Three depth shades (dark root → medium hubs → pale leaves), matching the
// reference's depth-driven Color.
const DEPTH_COLORS = ["#1a63a8", "#6f9fd0", "#cfe0f2"];

// ---- marks ----------------------------------------------------------------

// A point-ellipse's polar center is (min + w/2, min + h/2) in COORD units; put
// `min` at (θ − R, ρ − R) so the center lands exactly on (θ, ρ) and links meet
// nodes cleanly.
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

// Root LAST so its dark disc caps the spoke convergence at dead center.
const nodes = [
  ...placed.filter((p) => p.depth > 0),
  ...placed.filter((p) => p.depth === 0),
].map(nodeMark);

// Invisible zero-size point anchor at exact polar coords (center = min).
const pt = (theta: number, r: number) =>
  ellipse({ x: theta, y: r, w: 0, h: 0, fill: "none", stroke: "none" });

const LINK_STROKE = "#5f6b7a";
const LINK_WIDTH = 1.3;

// Parent→child links between explicit anchors (this pass knows every
// coordinate, so no name/ref plumbing).
const links = placed
  .filter((p) => p.parentPath !== null)
  .flatMap((p) => {
    const parent = byPath.get(p.parentPath!)!;
    if (parent.depth === 0) {
      // CENTER → hub: spiral swirl. Center anchor carries the child's angle
      // plus a constant lag so linear resampling winds it into a pinwheel arc.
      return [
        connect(
          {
            mode: "center",
            curve: "straight",
            fill: "none",
            stroke: LINK_STROKE,
            strokeWidth: LINK_WIDTH,
          },
          [pt(p.theta + SWIRL_LAG, 0), pt(p.theta, p.r)]
        ),
      ];
    }
    // hub → leaf: short petal hugging the ring, bowed slightly outward through
    // a mid anchor pushed just outside RING_R.
    const midTheta = (parent.theta + p.theta) / 2;
    return [
      connect(
        {
          mode: "center",
          curve: "straight",
          fill: "none",
          stroke: LINK_STROKE,
          strokeWidth: LINK_WIDTH,
        },
        [
          pt(parent.theta, parent.r),
          pt(midTheta, RING_R + RING_BULGE),
          pt(p.theta, p.r),
        ]
      ),
    ];
  });

export const RotationTree: StoryObj = {
  render: () => {
    const container = initializeContainer({ w: 520, h: 520 });
    // Inside a coord, paint order = array order (coord's flattenLayout ignores
    // zOrder). Links FIRST (under the nodes); the root node is last within
    // `nodes` so its dark disc caps the center.
    Frame({ coord: polar() as any }, [Layer([...links, ...nodes])]).render(
      container,
      { w: 520, h: 520 }
    );
    return container;
  },
};

const meta: Meta = {
  title: "GoTree / Gallery / RotationTree",
};
export default meta;
