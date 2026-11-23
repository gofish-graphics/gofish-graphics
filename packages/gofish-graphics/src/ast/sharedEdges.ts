// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

// Shared edges: the relational route to embedding (Route A in
// notes/design/embedding-annotations.md). A mark's edge on an axis is shared
// when a relation makes it the same position as a neighbor's edge. Two
// shared edges must stay one position after a coordinate transform, so a
// shared edge is a position of the space, and the axis it lies on embeds
// (`GoFishNode.resolveEmbedding`), whatever unit the mark's size is in.

import type { GoFishNode } from "./_node";
import { resolution } from "./_ref";
import type { ConstraintSpec } from "./constraints";
import { distributeChildrenInPlacementOrder } from "./constraints/distribute";
import type { Gap } from "./constraints/gap";
import {
  axisIndex,
  directSlot,
  isPointAlign,
  type AlignAnchor,
} from "./constraints/shared";

/** Which of a node's two edges on one axis are shared, in its own anchor
 *  terms: `start` and `end`, as `align` and `distribute` name them. */
export type Sides = { start: boolean; end: boolean };

/** A node's shared edges on each axis. */
export type SharedEdges = readonly [Sides, Sides];

export const NO_SHARED_EDGES: SharedEdges = [
  { start: false, end: false },
  { start: false, end: false },
];

/** Whether a node shares an edge on `axis`. */
export const sharesEdge = (edges: SharedEdges, axis: 0 | 1): boolean =>
  edges[axis].start || edges[axis].end;

type GapFields = { percent?: number; px?: number; fr?: number };

/** The fields of a gap: pixels, or a length's percent, pixels and weight. */
const gapFields = (gap: Gap): GapFields =>
  typeof gap === "number" ? { px: gap } : (gap as GapFields);

/** Whether a gap is 0 in every room: the parts it separates touch. */
const isZeroGap = (gap: Gap): boolean =>
  Object.values(gapFields(gap)).every((v) => v === undefined || v === 0);

/** Whether a gap is 0 or more in every room. */
const isNonNegativeGap = (gap: Gap): boolean =>
  Object.values(gapFields(gap)).every((v) => v === undefined || v >= 0);

/** Whether `node` has no size of its own on `axis`: its box there is its
 *  children's hull. */
const hugs = (node: GoFishNode, axis: 0 | 1): boolean =>
  node.ownDims?.[axis]?.size === undefined &&
  (node.args?.dims as { size?: unknown }[] | undefined)?.[axis]?.size ===
    undefined;

/**
 * The shared edges of each direct child of `node`, given `node`'s own
 * (`edges`), indexed by child slot. A child's edge is shared in two ways:
 *
 * - **It touches a neighbor.** A chain (`distribute`, a spread or a stack)
 *   with a box spacing whose gap is 0 puts each part's start on the
 *   previous part's end, in placement order. A stack glues its parts, so
 *   its gap is 0 too. Its parts are taken as amounts 0 or more: a negative
 *   part reaches back from its tail, so its tail is its end, which this
 *   does not read.
 * - **It lies on an edge of `node` that is shared.** An `align` at `start`
 *   or `end` puts that edge of each child on that edge of `node`, and a
 *   `span` puts both. A chain with a gap 0 or more starts at its first
 *   part's start and ends at its last part's end. Each holds only when the
 *   relation reaches every child and `node` has no size of its own on the
 *   axis, so its box is its children's hull: otherwise a child the
 *   relation misses, or `node`'s own size, may set its edge. A ring an
 *   elaboration pass put around its content (`_transparent`) is its
 *   content.
 *
 * A center relation (`middle`, `baseline`, a pitch spacing) pins one point
 * of a child, not an edge, so it shares none. An operand that resolves
 * inside a child (a nested operand) is not read.
 */
export function sharedEdgesOfChildren(
  node: GoFishNode,
  edges: SharedEdges
): [Sides, Sides][] {
  const out: [Sides, Sides][] = node.children.map(() => [
    { start: false, end: false },
    { start: false, end: false },
  ]);
  if (out.length === 0) return out;
  if (node._transparent) {
    out[0] = [{ ...edges[0] }, { ...edges[1] }];
    return out;
  }
  if (node.constraints.length === 0) return out;
  const resolved = resolution(node);
  // Whether `slots` holds every child of `node`, and `node`'s box on `axis`
  // is their hull: then an edge they all reach is `node`'s edge.
  const reachesEdgeOf = (slots: (number | undefined)[], axis: 0 | 1) => {
    if (!hugs(node, axis)) return false;
    const held = new Set(slots);
    return out.every((_, i) => held.has(i));
  };
  for (const c of node.constraints as readonly ConstraintSpec[]) {
    if (c.type === "distribute") {
      if (c.spacing.kind !== "box") continue;
      const axis = axisIndex(c.dir);
      const touching = isZeroGap(c.spacing.gap);
      const slots = distributeChildrenInPlacementOrder(c).map((ref) =>
        directSlot(resolved, ref)
      );
      const last = slots.length - 1;
      const spans =
        (edges[axis].start || edges[axis].end) &&
        isNonNegativeGap(c.spacing.gap) &&
        reachesEdgeOf(slots, axis);
      slots.forEach((i, k) => {
        if (i === undefined) return;
        const s = out[i][axis];
        if ((touching && k > 0) || (spans && k === 0 && edges[axis].start))
          s.start = true;
        if ((touching && k < last) || (spans && k === last && edges[axis].end))
          s.end = true;
      });
    } else if (c.type === "align") {
      const slots = c.children.map((ref) => directSlot(resolved, ref));
      for (const axis of [0, 1] as const) {
        const spec = axis === 0 ? c.x : c.y;
        if (spec === undefined) continue;
        const from = edges[axis];
        if (!from.start && !from.end) continue;
        if (!reachesEdgeOf(slots, axis)) continue;
        const anchorAt = (k: number): AlignAnchor | "span" | undefined =>
          spec === "span"
            ? "span"
            : isPointAlign(spec)
              ? Array.isArray(spec)
                ? spec[k]
                : spec
              : undefined;
        slots.forEach((i, k) => {
          if (i === undefined) return;
          const anchor = anchorAt(k);
          const s = out[i][axis];
          if (from.start && (anchor === "start" || anchor === "span"))
            s.start = true;
          if (from.end && (anchor === "end" || anchor === "span")) s.end = true;
        });
      }
    }
  }
  return out;
}
