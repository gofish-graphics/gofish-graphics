// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

import type { Placeable } from "../_node";
import { enclosingCircle } from "../geometry";
import {
  resolveOverlap,
  type OverlapSide,
  type OverlapStrategy,
} from "../graphicalOperators/overlap";
import type {
  AlignAnchor,
  Axis,
  ConstraintPosScales,
  ConstraintRef,
} from "./shared";
import { axisIndex } from "./shared";

/**
 * Spread the children out along `axis` so they stop covering each other,
 * growing from the line their `alignment` names (`scatter`'s `overlap`
 * option). The private elaboration target of `scatter`, like `grid` is for
 * `table`: there is no `Constraint.overlap`.
 *
 * It is not a difference constraint, so the placement solver never sees it.
 * The layer runs it after the solve (`applyConstraints`), when every child's
 * position on the other axis, the data axis, is known: where a child may sit
 * on `axis` depends on how far it is from its neighbors on the data axis.
 */
export interface OverlapConstraint {
  type: "overlap";
  /** The free axis: the one the children move along. */
  axis: Axis;
  /** The line the children grow from (scatter's `alignment`). */
  alignment: AlignAnchor;
  strategy: OverlapStrategy;
  /** The children, in priority order (data order). */
  children: ConstraintRef[];
}

export const createOverlapConstraint = (
  axis: Axis,
  alignment: AlignAnchor,
  strategy: OverlapStrategy,
  children: ConstraintRef[]
): OverlapConstraint => ({
  type: "overlap",
  axis,
  alignment,
  strategy,
  children,
});

export const isOverlapConstraint = (
  c: { type: string } | undefined
): c is OverlapConstraint => c?.type === "overlap";

/**
 * Place the children of an overlap constraint on its free axis. Each child is
 * read through its enclosing circle (`geometry()`), and is moved so that
 * circle's center lands at the offset its strategy chooses. The line sits at
 * the layer's local 0; the layer's box is the fold of where the children land,
 * so where the line is in the layer's frame does not matter.
 *
 * Distances are measured in the layout frame, which is the screen in a linear
 * space. `scatter` refuses an overlap strategy inside any other space.
 */
export function applyOverlapPlacement(
  constraint: OverlapConstraint,
  targets: Map<string, Placeable>,
  posScales?: ConstraintPosScales
): void {
  const free = axisIndex(constraint.axis);
  const data = (1 - free) as 0 | 1;
  const children = constraint.children.map((ref, i) => {
    const p = targets.get(ref.name);
    if (p === undefined)
      throw new Error(
        `[gofish] scatter overlap: child "${ref.name}" was not laid out`
      );
    const geometry = p.geometry();
    const circle = enclosingCircle(geometry);
    const center: [number, number] = [circle.cx, circle.cy];
    const min = p.dims[data].min;
    if (min === undefined)
      throw new Error(
        `[gofish] scatter overlap: child ${i} has no position on the data ` +
          `axis, so it cannot be kept clear of its neighbors`
      );
    const item = {
      at: min + (center[data] - geometry.box.min[data]),
      r: circle.r,
    };
    return { p, geometry, center, item };
  });
  // A child's start edge on the line means it grows to the positive side.
  // `baseline` is the same: for the dots an overlap strategy places (no data
  // extent), the baseline is the start edge.
  const { alignment } = constraint;
  const side: OverlapSide =
    alignment === "middle" ? "middle" : alignment === "end" ? "end" : "start";
  // Pixels per data unit on the data axis, for a strategy option given in
  // data units (jitter's `smoothing`).
  const sigma = posScales?.[data]?.sigma;
  const offsets = resolveOverlap(
    constraint.strategy,
    children.map((c) => c.item),
    side,
    sigma === undefined ? undefined : Math.abs(sigma)
  );
  children.forEach(({ p, geometry, center }, i) => {
    // Land the circle's center at the offset: place the child's box min at
    // the offset less the center's distance from that min.
    const min = offsets[i] - (center[free] - geometry.box.min[free]);
    if (p.pinAnchor) p.pinAnchor(free, min, "min");
    else p.place(free, min, "min");
  });
}
