// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

// What the relations around a node fix of it in its space. A relation that
// places marks relative to each other in a space must still hold after the
// space's transform. Read here, once, for two uses:
//
// - The relational route to embedding (Route A in
//   notes/design/embedding-annotations.md). When a relation relates both
//   edges of a mark on an axis, both edges are positions of the space, so
//   the mark's extent on that axis is a length of the space, and the axis
//   embeds (`GoFishNode.resolveEmbedding`), whatever unit the mark's size is
//   in.
// - The pinned point of a drawing that does not warp (`rigid.ts`). A rigid
//   drawing agrees with a warped space at one point only, so the space
//   places it with the point its relations fix (its `pins`) on that point's
//   image.

import type { GoFishNode } from "./_node";
import { resolution } from "./_ref";
import type { ConstraintSpec } from "./constraints";
import { isPositionInterval } from "./constraints/position";
import {
  axisIndex,
  directSlot,
  pointAlignOn,
  type AlignAnchor,
} from "./constraints/shared";

/** What the relations around a node fix of it on one axis. */
export type AxisRelations = {
  /** A relation fixes its extent: both its edges are positions of the
   *  space, so the axis embeds (Route A). */
  readonly extent: boolean;
  /** The points of its box that a relation fixes in the space, each once:
   *  its `start` or `end` edge, its `middle`, or its `baseline` (local 0). */
  readonly pins: readonly AlignAnchor[];
};

/** {@link AxisRelations} on x and on y. */
export type Relations = readonly [AxisRelations, AxisRelations];

const FREE: AxisRelations = { extent: false, pins: [] };
export const UNRELATED: Relations = [FREE, FREE];

/** Whether `node` has no size of its own on `axis`: its box there is its
 *  children's hull. */
const hugs = (node: GoFishNode, axis: 0 | 1): boolean =>
  node.ownDims?.[axis]?.size === undefined &&
  (node.args?.dims as { size?: unknown }[] | undefined)?.[axis]?.size ===
    undefined;

/**
 * What the relations of `node`, and those that fix `node` itself
 * (`related`), fix of each of its direct children on each axis, indexed by
 * child slot.
 *
 * A relation of `node` among two or more children fixes these points of
 * each child it reads:
 *
 * - A chain (`distribute`, a spread or a stack) with a box spacing of any
 *   gap (pixels, a percent, an `fr` weight) or `Spacing.atLeast` ties each
 *   part's start to the end of the part before it and its end to the start
 *   of the part after it, along the chain's axis. With `ends`, the first
 *   part's start and the last part's end are tied to the layer's box too.
 *   It fixes every part's extent.
 * - A pitch spacing fixes its `at` point of each part, and not its extent.
 * - An `align` by `span` fixes both edges and the extent of each operand.
 *   An `align` at one anchor fixes that point of each operand; one at
 *   `start` together with one at `end` fixes both edges, and so the extent.
 *
 * A `Constraint.position` at a point fixes its `anchor` of its target on
 * each axis it gives, and not its extent. An operand that resolves inside a
 * child (a nested operand) is not read.
 *
 * A child is also fixed as `node` is when it is `node`'s extent: an only
 * child of a node with no size of its own on the axis is that node's hull,
 * and a ring an elaboration pass put around its content (`_transparent`)
 * is its content.
 */
export function relationsOfChildren(
  node: GoFishNode,
  related: Relations
): Relations[] {
  const n = node.children.length;
  if (n === 0) return [];
  if (node._transparent) return [related, ...Array(n - 1).fill(UNRELATED)];
  // Per child and axis: the pins, and whether its extent is fixed.
  const acc = node.children.map(() =>
    [0, 1].map(() => ({
      extent: false,
      pins: new Set<AlignAnchor>(),
      // The edges an `align` of `node` relates: both together fix the extent.
      aligned: new Set<AlignAnchor>(),
    }))
  );
  if (n === 1)
    for (const axis of [0, 1] as const)
      if (hugs(node, axis)) {
        acc[0][axis].extent = related[axis].extent;
        for (const p of related[axis].pins) acc[0][axis].pins.add(p);
      }
  const resolved = node.constraints.length === 0 ? undefined : resolution(node);
  const pin = (i: number | undefined, axis: 0 | 1, p: AlignAnchor) => {
    if (i !== undefined) acc[i][axis].pins.add(p);
  };
  for (const c of node.constraints as readonly ConstraintSpec[]) {
    if (c.type === "distribute") {
      const slots = c.children.map((ref) => directSlot(resolved!, ref));
      if (slots.length < 2) continue;
      const axis = axisIndex(c.dir);
      if (c.spacing.kind === "pitch") {
        const at = c.spacing.at ?? "baseline";
        slots.forEach((i) => pin(i, axis, at));
        continue;
      }
      const ends = c.spacing.ends !== undefined;
      slots.forEach((i, k) => {
        if (i === undefined) return;
        acc[i][axis].extent = true;
        if (k > 0 || ends) pin(i, axis, "start");
        if (k < slots.length - 1 || ends) pin(i, axis, "end");
      });
    } else if (c.type === "align") {
      const slots = c.children.map((ref) => directSlot(resolved!, ref));
      if (slots.length < 2) continue;
      for (const axis of [0, 1] as const) {
        const spec = axis === 0 ? c.x : c.y;
        if (spec === "span") {
          slots.forEach((i) => {
            if (i === undefined) return;
            acc[i][axis].extent = true;
            pin(i, axis, "start");
            pin(i, axis, "end");
          });
          continue;
        }
        const point = pointAlignOn(c, axis);
        if (point === undefined) continue;
        slots.forEach((i, k) => {
          if (i === undefined) return;
          const anchor = Array.isArray(point) ? point[k] : point;
          acc[i][axis].aligned.add(anchor);
          pin(i, axis, anchor);
        });
      }
    } else if (c.type === "position") {
      const slots = c.children.map((ref) => directSlot(resolved!, ref));
      for (const axis of [0, 1] as const) {
        const coord = axis === 0 ? c.x : c.y;
        if (coord === undefined || isPositionInterval(coord)) continue;
        slots.forEach((i) => pin(i, axis, c.anchor));
      }
    }
  }
  return acc.map(
    (axes) =>
      axes.map(({ extent, pins, aligned }) => ({
        extent: extent || (aligned.has("start") && aligned.has("end")),
        pins: [...pins],
      })) as unknown as Relations
  );
}
