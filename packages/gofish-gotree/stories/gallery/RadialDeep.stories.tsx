import type { Meta, StoryObj } from "@storybook/html";
import { ellipse, connect, Layer, Frame, polar } from "gofish-graphics";
import { initializeContainer } from "../helper";
import { flareVis, type FlareNode } from "./_flareVis";

// GoTree gallery port — radial-deep (deep radial node-link tree).
//
// NOTES — data-position layout (per issue #627):
//   This story intentionally BYPASSES the gotree tree()/combine() DSL for node
//   placement. Instead a small story-local data pass computes each node's polar
//   position directly and we place marks explicitly. GoTree's angular
//   allocation (dsl X: Root=include / Subtree=flatten) can't be expressed with
//   the constraint primitives available today, so we replicate its decoded
//   math — bottom-up recursive box packing on the global angular axis:
//     - a LEAF's box is 1 unit wide; an INTERNAL node's box INFLATES around its
//       children — boxWidth = Σ(child boxWidths) / (1 − m) — and the slack is
//       dealt out space-around style as gaps flanking each child (see
//       SUBTREE_MARGIN below). Leaf pitch thus shrinks by (1 − m) per nesting
//       level while sibling subtrees gain separating gaps at EVERY level,
//       including between the root's children.
//     - θ(node) = 2π · (its box center) / rootBoxWidth — the domain is the
//       root's INFLATED width — in RAW RADIANS; r(node) = depth · ringSpacing
//       in RAW PIXELS. Plain numbers bypass GoFish's scale machinery (no
//       posScale/domain work) — the "simple thing for now" #627 calls for.
//       A parent sits at its box center (centered over its fan), and a 6-leaf
//       subtree claims ~6× the angle of a childless sibling — the reference's
//       UNEVEN spoke gaps. With m = 0 this reduces exactly to uniform slots.
//   Fixed-size circles at the shrunken fan pitch OVERLAP like stacked coins,
//   separated by white halo strokes — that overlap is intended (it matches the
//   reference), as is the angular seam gap between adjacent subtrees.
//
//   Follow-up (not blocking): compiling these flatten-θ point layouts down to
//   real fields/scales (so the DSL can express them) is future work.
//
//   Links: the dsl asks for `curve` links; curve interpolation is unimplemented
//   (tracked for PR #637). `curve:"bezier"` was tried first, but under
//   the polar transform its control-point resampling winds the parent→child
//   segments into wild spirals, so we fall back to `curve:"straight"`.
//   Linear segments resample cleanly into the (near-)radial spokes seen here;
//   the reference's gentle curve is therefore drawn straight. Link thickness
//   tapers by depth (dsl Thickness=depth, Min 1 / Max 9): thick near the root,
//   thin outward.
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

// Reference proportions at 520×520: node diameter ≈ 6% of the canvas → radius
// ~15.5px; rings at ~117px so the outer ring sits near ±235px.
const NODE_R = 15.5;
const RING_SPACING = 117;
// GoTree's X.Subtree flatten Margin (fraction-of-box units, MarginType
// "space-around"): the solver constraint is Σ(childWidths) = (1−m)·subtreeWidth,
// so each internal box inflates by 1/(1−m) and the angular domain includes the
// margin units. The reference PNG was rendered with this set to ≈0.5 in the
// GoTree editor even though the committed dsl.json omits it.
const SUBTREE_MARGIN = 0.55;

const layout = (root: FlareNode): Placed[] => {
  const m = SUBTREE_MARGIN;

  // Bottom-up: a leaf's box is 1 unit; an internal box inflates around its
  // children's total so the slack (m·boxWidth) becomes space-around gaps.
  const boxWidth = (n: FlareNode): number =>
    n.children?.length
      ? n.children.reduce((s, c) => s + boxWidth(c), 0) / (1 - m)
      : 1;
  const rootWidth = boxWidth(root);

  const placed: Placed[] = [];

  // Top-down: pack each node's children left-to-right inside its box,
  // space-around style (half a gap on each side of every child), and place the
  // node itself at its box center. Total = content + s·gap = boxWidth exactly.
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

// Link thickness tapers by the PARENT's depth (dsl Thickness=depth, Min 1,
// Max 9): root→child spokes thick, leaf-fan links thin.
const linkWidth = (parentDepth: number) => (parentDepth === 0 ? 7.5 : 2.25);

// Three depth shades sampled from the reference (dark root → pale leaves).
const DEPTH_COLORS = ["#1a63a8", "#6f9fd0", "#cfe0f2"];

// ---- marks ----------------------------------------------------------------

// A point-ellipse's polar center is (min + w/2, min + h/2) in COORD units and
// its screen radius is w/2 — the two are coupled. Placing `min` at (θ − R, ρ −
// R) lands the center EXACTLY on (θ, ρ) for any node size, so links (drawn
// between node centers) meet nodes cleanly regardless of the node's diameter.
const nodeMark = (p: Placed) =>
  ellipse({
    x: p.theta - NODE_R,
    y: p.r - NODE_R,
    w: NODE_R * 2,
    h: NODE_R * 2,
    fill: DEPTH_COLORS[Math.min(p.depth, DEPTH_COLORS.length - 1)],
    stroke: "white",
    strokeWidth: 2.75,
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
// coordinate, links don't need name/ref plumbing at all (refs would also force
// the named nodes to precede the connects in the layer array, which fights the
// links-under-nodes paint order; see the render note below).
const pt = (theta: number, r: number) =>
  ellipse({ x: theta, y: r, w: 0, h: 0, fill: "none", stroke: "none" });

// Parent→child links between explicit endpoint anchors. fill:"none" so only
// the stroke shows once the segment is resampled by polar.
//
// Root→child spokes start at (θ_child, 0) — the center, but carrying the
// CHILD's angle — so each spoke is a straight radial line (θ constant); a
// `linear` connect from the root's own coords (θ_root, 0) would spiral from
// θ_root out to the child's angle. Deeper fan links go parent→child directly
// (a gentle sweep, matching the reference's fanned leaf links).
const links = placed
  .filter((p) => p.parentPath !== null)
  .map((p) => {
    const parent = byPath.get(p.parentPath!)!;
    const src: [number, number] =
      parent.depth === 0 ? [p.theta, 0] : [parent.theta, parent.r];
    return connect(
      {
        mode: "center",
        curve: "straight",
        fill: "none",
        stroke: "#5f6b7a",
        strokeWidth: linkWidth(parent.depth),
      },
      [pt(src[0], src[1]), pt(p.theta, p.r)]
    );
  });

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
  title: "GoTree / Gallery / radial-deep",
};
export default meta;
