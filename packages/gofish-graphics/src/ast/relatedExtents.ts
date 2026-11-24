// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

// Related extents: the relational route to embedding (Route A in
// notes/design/embedding-annotations.md). A relation that places marks
// relative to each other in a space must still hold after the space's
// transform. When it relates both edges of a mark on an axis, both edges
// are positions of the space, so the mark's extent on that axis is a length
// of the space, and the axis embeds (`GoFishNode.resolveEmbedding`),
// whatever unit the mark's size is in. A relation that pins one point of a
// mark (a center or baseline align, a pitch spacing) places the mark there
// and says nothing about its extent.

import type { GoFishNode } from "./_node";
import { resolution } from "./_ref";
import type { ConstraintSpec } from "./constraints";
import { axisIndex, directSlot, pointAlignOn } from "./constraints/shared";

/** Whether a relation fixes a node's extent on each axis. */
export type RelatedExtents = readonly [boolean, boolean];

export const UNRELATED: RelatedExtents = [false, false];

/** Whether `node` has no size of its own on `axis`: its box there is its
 *  children's hull. */
const hugs = (node: GoFishNode, axis: 0 | 1): boolean =>
  node.ownDims?.[axis]?.size === undefined &&
  (node.args?.dims as { size?: unknown }[] | undefined)?.[axis]?.size ===
    undefined;

/**
 * Whether a relation fixes the extent of each direct child of `node` on
 * each axis, given whether one fixes `node`'s (`related`), indexed by child
 * slot. A child's extent is fixed in two ways:
 *
 * - **A relation of `node` relates both of its edges.** A chain
 *   (`distribute`, a spread or a stack) with a box spacing of any gap
 *   (pixels, a percent, an `fr` weight) or `Spacing.atLeast` relates each
 *   part's start and end to its neighbors' edges, along the chain's axis.
 *   An `align` by `span` relates both edges of each operand; an `align` at
 *   `start` relates the start and one at `end` the end, so the two together
 *   relate both. Only a relation among two or more children relates them.
 * - **It is `node`'s extent.** An only child of a node with no size of its
 *   own on the axis is that node's hull, and a ring an elaboration pass put
 *   around its content (`_transparent`) is its content, so a relation that
 *   fixes `node`'s extent fixes the child's.
 *
 * A pitch spacing and an `align` at `middle` or `baseline` pin one point of
 * each child, so they place it without fixing its extent. An operand that
 * resolves inside a child (a nested operand) is not read.
 */
export function relatedExtentsOfChildren(
  node: GoFishNode,
  related: RelatedExtents
): [boolean, boolean][] {
  const out: [boolean, boolean][] = node.children.map(() => [false, false]);
  if (out.length === 0) return out;
  if (node._transparent) {
    out[0] = [related[0], related[1]];
    return out;
  }
  if (out.length === 1)
    for (const axis of [0, 1] as const)
      if (hugs(node, axis)) out[0][axis] = related[axis];
  if (node.constraints.length === 0) return out;
  const resolved = resolution(node);
  // Which edges of each child a relation of `node` relates, per axis.
  const edges = node.children.map(() =>
    [0, 1].map(() => ({ start: false, end: false }))
  );
  const relate = (
    slots: (number | undefined)[],
    axis: 0 | 1,
    which: (k: number) => { start: boolean; end: boolean }
  ) => {
    if (slots.length < 2) return;
    slots.forEach((i, k) => {
      if (i === undefined) return;
      const { start, end } = which(k);
      if (start) edges[i][axis].start = true;
      if (end) edges[i][axis].end = true;
    });
  };
  for (const c of node.constraints as readonly ConstraintSpec[]) {
    if (c.type === "distribute") {
      if (c.spacing.kind === "pitch") continue;
      const slots = c.children.map((ref) => directSlot(resolved, ref));
      relate(slots, axisIndex(c.dir), () => ({ start: true, end: true }));
    } else if (c.type === "align") {
      const slots = c.children.map((ref) => directSlot(resolved, ref));
      for (const axis of [0, 1] as const) {
        const spec = axis === 0 ? c.x : c.y;
        if (spec === "span") {
          relate(slots, axis, () => ({ start: true, end: true }));
          continue;
        }
        const point = pointAlignOn(c, axis);
        if (point === undefined) continue;
        relate(slots, axis, (k) => {
          const anchor = Array.isArray(point) ? point[k] : point;
          return { start: anchor === "start", end: anchor === "end" };
        });
      }
    }
  }
  edges.forEach((axes, i) =>
    axes.forEach(({ start, end }, axis) => {
      if (start && end) out[i][axis] = true;
    })
  );
  return out;
}
