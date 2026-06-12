// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import {
  AlignAnchor,
  Axis,
  ConstraintRef,
  axisIndex,
  isPlacedOn,
} from "./shared";
import type { UnderlyingSpace } from "../underlyingSpace";
import { resolveAlignmentSpace } from "../graphicalOperators/alignment";

/**
 * PROTOTYPE (issue #475): the align constraint's *space-resolution*
 * contribution — the cross-axis half of the spread reduction. Defers entirely
 * to spread's own `resolveAlignmentSpace`, so the fold is the same one spread
 * uses (SIZE→POSITION for start/end/baseline; SIZE→DIFFERENCE for middle;
 * POSITION union otherwise). `AlignAnchor` and spread's `Alignment` share the
 * same string vocabulary, so the anchor passes through unchanged.
 *
 * Only the uniform-anchor form is handled (a single string, not a per-child
 * array): a heterogeneous anchor array has no single spread equivalent.
 */
export function alignSpaceFold(
  targetSpaces: UnderlyingSpace[],
  anchor: AlignAnchor
): UnderlyingSpace {
  return resolveAlignmentSpace(targetSpaces, anchor).space;
}

/**
 * Anchor spec for one axis of an `align` constraint. A single anchor
 * is shared by every child (the common case). An array gives each child its
 * own anchor positionally — `align({x: ["middle", "start"]}, [A, B])` aligns
 * A's center with B's start. The array length must equal `children.length`.
 */
export type AlignAxisSpec = AlignAnchor | AlignAnchor[];

export interface AlignConstraint {
  type: "align";
  x?: AlignAxisSpec;
  y?: AlignAxisSpec;
  children: ConstraintRef[];
}

export interface AlignOptions {
  x?: AlignAxisSpec;
  y?: AlignAxisSpec;
}

export const createAlignConstraint = (
  { x, y }: AlignOptions,
  children: ConstraintRef[]
): AlignConstraint => {
  if (x === undefined && y === undefined) {
    throw new Error(
      "Constraint.align: at least one of `x` or `y` must be specified"
    );
  }
  return { type: "align", x, y, children };
};

export interface AlignFallbackBaseline {
  start?: number;
  middle?: number;
  end?: number;
}

/** Read the coordinate of `target` along axis `idx` at anchor `a`. */
const anchorValue = (target: Placeable, idx: 0 | 1, a: AlignAnchor): number =>
  a === "start"
    ? target.dims[idx].min!
    : a === "middle"
      ? target.dims[idx].center!
      : a === "baseline"
        ? // The target's origin: its placed translate (0 if intrinsic-only).
          (target.transform?.translate?.[idx] ?? 0)
        : target.dims[idx].max!;

/** Place `target` on `axis` so its anchor `a` lands at `value`. */
export const placeAtAnchor = (
  target: Placeable,
  axis: Axis,
  value: number,
  a: AlignAnchor
): void => {
  if (a === "start") target.place(axis, value);
  else if (a === "middle") target.place(axis, value, "center");
  else if (a === "baseline") target.place(axis, value, "baseline");
  else target.place(axis, value, "max");
};

/**
 * Where the enforced alignment coordinate (the "baseline") comes from. This is
 * the one genuine divergence between the two align callsites, so it is an
 * explicit parameter and each callsite supplies its own:
 *
 *  - `readPlaced` reads the baseline off the *first already-placed* target, at
 *    that target's anchor. The constraint path reads the target's real extent /
 *    origin (so a `"baseline"` anchor takes its actual `transform.translate`);
 *    spread pins a `"baseline"` anchor to 0 and tolerates missing extents.
 *  - `fallback` supplies the baseline when *nothing* is pre-placed. The
 *    constraint path returns the layer's own box edge (start→0, middle→size/2,
 *    end→size, baseline→0) — axis-title elaboration relies on a title pinning to
 *    the plot box. Spread instead returns the data scale's origin
 *    (`posScale(0)`, or `size/2` for middle, or 0 with no scale) so a
 *    SIZE-derived cross axis aligns at the scale's zero, not the box edge. Both
 *    are load-bearing; neither subsumes the other.
 */
export interface AlignBaselinePolicy {
  readPlaced: (target: Placeable, idx: 0 | 1, anchor: AlignAnchor) => number;
  fallback: (anchors: AlignAnchor[], idx: 0 | 1) => number;
}

/**
 * Place `targets` on one axis so each lands at a single shared baseline,
 * read at its own anchor. The baseline is taken from the first already-placed
 * target (via `policy.readPlaced`), or from `policy.fallback` when none is
 * placed; already-placed targets are left untouched. This is the single
 * placement walk shared by the `align` constraint and spread's cross-axis
 * alignment — only the baseline policy differs (see `AlignBaselinePolicy`).
 */
export function alignTargets(
  targets: Placeable[],
  axis: Axis,
  anchors: AlignAnchor[],
  policy: AlignBaselinePolicy
): void {
  const idx = axisIndex(axis);

  let baseline: number | undefined;
  for (let i = 0; i < targets.length; i++) {
    if (isPlacedOn(targets[i], idx)) {
      baseline = policy.readPlaced(targets[i], idx, anchors[i]);
      break;
    }
  }
  if (baseline === undefined) baseline = policy.fallback(anchors, idx);

  for (let i = 0; i < targets.length; i++) {
    if (isPlacedOn(targets[i], idx)) continue;
    placeAtAnchor(targets[i], axis, baseline, anchors[i]);
  }
}

const fallbackFor = (
  fallback: AlignFallbackBaseline | undefined,
  a: AlignAnchor
): number =>
  (a === "start"
    ? fallback?.start
    : a === "middle"
      ? fallback?.middle
      : a === "baseline"
        ? // Baseline-anchored targets pin their origin to the layer's origin.
          0
        : fallback?.end) ?? 0;

function applyAlignAxis(
  axis: Axis,
  spec: AlignAxisSpec,
  targets: Placeable[],
  fallback?: AlignFallbackBaseline
): void {
  // Normalize to a per-child anchor array.
  let anchors: AlignAnchor[];
  if (Array.isArray(spec)) {
    if (spec.length !== targets.length) {
      throw new Error(
        `Constraint.align: anchor array length ${spec.length} must match number of children ${targets.length}`
      );
    }
    anchors = spec;
  } else {
    anchors = new Array<AlignAnchor>(targets.length).fill(spec);
  }

  // Layer-box policy: read a placed sibling's real extent/origin; with no
  // placed sibling, fall back to the layer's own box baseline.
  alignTargets(targets, axis, anchors, {
    readPlaced: anchorValue,
    fallback: (as) => fallbackFor(fallback, as[0]),
  });
}

export function applyAlign(
  constraint: AlignConstraint,
  targets: Placeable[],
  fallback?: { x?: AlignFallbackBaseline; y?: AlignFallbackBaseline }
): void {
  if (constraint.x !== undefined) {
    applyAlignAxis("x", constraint.x, targets, fallback?.x);
  }
  if (constraint.y !== undefined) {
    applyAlignAxis("y", constraint.y, targets, fallback?.y);
  }
}
