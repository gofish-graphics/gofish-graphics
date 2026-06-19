// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import { type Size } from "../dims";
import { isValue } from "../data";
import { allocateSlices } from "./folds";
import type { ConstraintSpec } from ".";
import type { GridConstraint } from "./grid";

export type SliceSegment = {
  dAxis: 0 | 1;
  spacing: number;
  order: string[];
};

/** Build per-child size proposals from distribute budget segments.
 *
 * This is the top-down adjoint of the distribute SIZE fold: once a layer has a
 * concrete pixel budget, each distribute segment slices that axis among its
 * covered children. A child may be covered by at most one distribute segment per
 * axis. Otherwise the proposal would be declaration-order-sensitive because the
 * layer can hand only one size per child axis. */
export function buildDistributeSliceMap(
  segments: SliceSegment[],
  size: Size
): Map<string, Size> | undefined {
  if (segments.length === 0) return undefined;

  const out = new Map<string, Size>();
  const ownerOf = new Map<string, string>();

  for (const [segmentIndex, segment] of segments.entries()) {
    const owner = `distribute[${segmentIndex}]`;
    const slices = allocateSlices(
      size[segment.dAxis],
      segment.spacing,
      segment.order.length
    );
    segment.order.forEach((name, i) => {
      const key = `${segment.dAxis}:${name}`;
      const prior = ownerOf.get(key);
      if (prior !== undefined) {
        throw new Error(
          `Constraint.distribute proposal conflict on ${
            segment.dAxis === 0 ? "x" : "y"
          }: child "${name}" is covered by both ${prior} and ${owner}`
        );
      }
      ownerOf.set(key, owner);
      const cur = out.get(name) ?? ([size[0], size[1]] as Size);
      cur[segment.dAxis] = slices[i];
      out.set(name, cur);
    });
  }

  return out;
}

/** A grid owns the whole two-axis proposal scope for its layer. Multiple grids
 * would otherwise be source-order-sensitive because space resolution and
 * proposal sizing can only choose one track partition while placement would see
 * all pins. */
export function selectGridConstraint(
  constraints: readonly ConstraintSpec[]
): GridConstraint | undefined {
  let selected: GridConstraint | undefined;
  for (const constraint of constraints) {
    if (constraint.type !== "grid") continue;
    if (selected !== undefined) {
      throw new Error(
        "Constraint.grid proposal conflict: a layer may have at most one grid constraint"
      );
    }
    selected = constraint;
  }
  return selected;
}

/** Per-child axes whose placement is owned by datum-valued position
 * constraints. Those children must not also receive the same posScale from the
 * enclosing layer: the constraint consumes the scale to place them. Literal
 * pixel positions are deliberately excluded because they do not consume a data
 * scale, so the child may still need that scale for its own geometry. */
export function buildPositionTargetDims(
  constraints: readonly ConstraintSpec[]
): Map<string, Set<0 | 1>> {
  const collected = new Map<string, Set<0 | 1>>();
  for (const constraint of constraints) {
    if (constraint.type !== "position") continue;
    for (const ref of constraint.children) {
      const dims = collected.get(ref.name) ?? new Set<0 | 1>();
      if (constraint.x !== undefined && isValue(constraint.x)) dims.add(0);
      if (constraint.y !== undefined && isValue(constraint.y)) dims.add(1);
      if (dims.size > 0) collected.set(ref.name, dims);
    }
  }
  return new Map(
    [...collected.entries()].sort(([a], [b]) => a.localeCompare(b))
  );
}
