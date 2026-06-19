// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import type { Axis } from "./shared";

/** Reports a fixed (already-placed) child whose position disagrees with where
 *  the running distribute walk expected it. spread.tsx passes this to surface
 *  the warning it used to emit from its own walk; the constraint path omits it
 *  (no warning), so console output there is unchanged. Fires only past the
 *  `1e-6` tolerance. */
export type DistributeInconsistencyReporter = (
  expected: number,
  actual: number
) => void;

/** The subset of a distribute constraint the placement walk reads. The
 *  constraint path passes its full constraint (which satisfies this shape
 *  structurally); spread passes just these fields — `children` is never
 *  consumed here, since targets arrive as Placeables. */
export interface DistributeWalkOptions {
  dir: Axis;
  spacing: number;
  mode: "edge" | "center";
  order: "forward" | "reverse";
}

/** One emitted placement equation: the target's `anchor` facet lands at `value`.
 *  `min`/`max`/`center` are the box facets the distribute pins. */
export interface DistributePlacement {
  target: Placeable;
  anchor: "min" | "max" | "center";
  value: number;
}

const axisIndex = (axis: Axis): 0 | 1 => (axis === "x" ? 0 : 1);
const isPlacedOn = (target: Placeable, axis: 0 | 1): boolean =>
  target.dims[axis].min !== undefined;

/**
 * EMIT the distribute as a list of facet-placement equations (each target's
 * anchor → a value) WITHOUT applying them — the facet-equation-emitter form of
 * the constraint (#39). The relational contiguity chain
 * (`child[i+1].min = child[i].max + spacing`) is resolved to absolute pins from
 * the children's sizes and any pre-placed anchor; the walk reads only
 * pre-existing geometry, never a placement it emits, so the emit is pure. The
 * `apply` path commits these via `place()`; a future per-scope solver can consume
 * the same equations instead of pinning eagerly.
 */
export function emitDistribute(
  constraint: DistributeWalkOptions,
  targets: Placeable[],
  onInconsistency?: DistributeInconsistencyReporter
): DistributePlacement[] {
  const idx = axisIndex(constraint.dir);
  const ordered =
    constraint.order === "reverse" ? [...targets].reverse() : targets;
  const out: DistributePlacement[] = [];

  const checkInconsistent = (expected: number, actual: number): void => {
    if (onInconsistency && Math.abs(expected - actual) > 1e-6) {
      onInconsistency(expected, actual);
    }
  };

  const anchorIdx = ordered.findIndex((target) => isPlacedOn(target, idx));

  if (anchorIdx === -1) {
    let pos = 0;
    for (const target of ordered) {
      if (constraint.mode === "center") {
        out.push({ target, anchor: "center", value: pos });
        pos += constraint.spacing;
      } else {
        out.push({ target, anchor: "min", value: pos });
        pos += (target.dims[idx].size ?? 0) + constraint.spacing;
      }
    }
    return out;
  }

  if (constraint.mode === "edge") {
    let pos = ordered[anchorIdx].dims[idx].max! + constraint.spacing;
    for (let i = anchorIdx + 1; i < ordered.length; i++) {
      const target = ordered[i];
      if (isPlacedOn(target, idx)) {
        checkInconsistent(pos, target.dims[idx].min!);
        pos = target.dims[idx].max! + constraint.spacing;
      } else {
        out.push({ target, anchor: "min", value: pos });
        pos += (target.dims[idx].size ?? 0) + constraint.spacing;
      }
    }

    pos = ordered[anchorIdx].dims[idx].min! - constraint.spacing;
    for (let i = anchorIdx - 1; i >= 0; i--) {
      const target = ordered[i];
      if (isPlacedOn(target, idx)) {
        pos = target.dims[idx].min! - constraint.spacing;
      } else {
        out.push({ target, anchor: "max", value: pos });
        pos -= (target.dims[idx].size ?? 0) + constraint.spacing;
      }
    }
  } else {
    let pos = ordered[anchorIdx].dims[idx].center! + constraint.spacing;
    for (let i = anchorIdx + 1; i < ordered.length; i++) {
      const target = ordered[i];
      if (isPlacedOn(target, idx)) {
        checkInconsistent(pos, target.dims[idx].center!);
        pos = target.dims[idx].center! + constraint.spacing;
      } else {
        out.push({ target, anchor: "center", value: pos });
        pos += constraint.spacing;
      }
    }

    pos = ordered[anchorIdx].dims[idx].center! - constraint.spacing;
    for (let i = anchorIdx - 1; i >= 0; i--) {
      const target = ordered[i];
      if (isPlacedOn(target, idx)) {
        pos = target.dims[idx].center! - constraint.spacing;
      } else {
        out.push({ target, anchor: "center", value: pos });
        pos -= constraint.spacing;
      }
    }
  }
  return out;
}

/** Commit the emitted distribute equations: pin each target's anchor at its
 *  value. Behind today's signature; the emit/commit split is the seam a per-scope
 *  solver slots into (consume {@link emitDistribute} instead of pinning here). */
export function applyDistribute(
  constraint: DistributeWalkOptions,
  targets: Placeable[],
  onInconsistency?: DistributeInconsistencyReporter
): void {
  for (const placement of emitDistribute(
    constraint,
    targets,
    onInconsistency
  )) {
    placement.target.place(constraint.dir, placement.value, placement.anchor);
  }
}
