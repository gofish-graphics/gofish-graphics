// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import {
  AlignAnchor,
  Axis,
  ConstraintRef,
  ConstraintPosScales,
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

/** Per-axis environment threaded to the shared fallback: the layer's box size
 *  on this axis and the axis's data→pixel position scale (if any).
 *  `alignFallbackBaseline` dispatches on which of these the axis carries — a
 *  posScale picks the scale origin, otherwise the box edge. */
export interface AlignAxisEnv {
  size: number;
  posScale: ((v: number) => number) | undefined;
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
 * Where the enforced alignment coordinate (the "baseline") comes from when a
 * sibling *is* already placed. This `readPlaced` reader is the one remaining
 * per-callsite difference between the two align callsites (and is out of scope
 * for #552): the constraint path reads the target's real extent / origin (so a
 * `"baseline"` anchor takes its actual `transform.translate`); spread pins a
 * `"baseline"` anchor to 0 and tolerates missing extents. The no-sibling
 * fallback is now SHARED and space-kind-dispatched (see
 * `alignFallbackBaseline`), so it is no longer part of this policy.
 */
export interface AlignBaselinePolicy {
  readPlaced: (target: Placeable, idx: 0 | 1, anchor: AlignAnchor) => number;
}

/** Fallback alignment baseline when no sibling is pre-placed on the axis.
 *  Dispatches on the axis's underlying-space kind, not the call site: a
 *  posScale-carrying (POSITION) axis falls back to the scale origin
 *  `posScale(0)` (bars hang from the zero line); a pixel-pure axis falls back
 *  to the layer-box edge for the anchor (axis titles and chrome pin to the
 *  box). `middle` is box-center either way: it resolves to DIFFERENCE space —
 *  an extent with no anchored origin — so a scale origin is meaningless for it.
 *  The `end` box edge is finite-guarded: an unsized axis hands NaN down, and
 *  the fallback must stay 0 there, not inject NaN translates. */
export const alignFallbackBaseline = (
  anchor: AlignAnchor,
  size: number,
  posScale: ((v: number) => number) | undefined
): number => {
  if (anchor === "middle") return size / 2;
  if (posScale) return posScale(0);
  if (anchor === "end") return Number.isFinite(size) ? size : 0;
  return 0; // start | baseline → layer origin
};

/**
 * Place `targets` on one axis so each lands at a single shared baseline,
 * read at its own anchor. The baseline is taken from the first already-placed
 * target (via `policy.readPlaced`), or from the shared space-kind-dispatched
 * `alignFallbackBaseline` when none is placed; already-placed targets are left
 * untouched. This is the single placement walk shared by the `align` constraint
 * and spread's cross-axis alignment — only the `readPlaced` reader differs (see
 * `AlignBaselinePolicy`).
 */
export function alignTargets(
  targets: Placeable[],
  axis: Axis,
  anchors: AlignAnchor[],
  policy: AlignBaselinePolicy,
  env: AlignAxisEnv
): void {
  const idx = axisIndex(axis);

  let baseline: number | undefined;
  for (let i = 0; i < targets.length; i++) {
    if (isPlacedOn(targets[i], idx)) {
      baseline = policy.readPlaced(targets[i], idx, anchors[i]);
      break;
    }
  }
  // Note: the fallback keys on `anchors[0]` (the first child's anchor), not the
  // per-child anchor — preserved from the original `as[0]` indexing.
  if (baseline === undefined)
    baseline = alignFallbackBaseline(anchors[0], env.size, env.posScale);

  for (let i = 0; i < targets.length; i++) {
    if (isPlacedOn(targets[i], idx)) continue;
    placeAtAnchor(targets[i], axis, baseline, anchors[i]);
  }
}

function applyAlignAxis(
  axis: Axis,
  spec: AlignAxisSpec,
  targets: Placeable[],
  env: AlignAxisEnv
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

  // Read a placed sibling's real extent/origin; with no placed sibling, the
  // shared space-kind fallback decides (scale origin on a scaled axis, box edge
  // on a pixel-pure one).
  alignTargets(targets, axis, anchors, { readPlaced: anchorValue }, env);
}

export function applyAlign(
  constraint: AlignConstraint,
  targets: Placeable[],
  sizes: [number, number],
  posScales: ConstraintPosScales | undefined
): void {
  if (constraint.x !== undefined) {
    applyAlignAxis("x", constraint.x, targets, {
      size: sizes[0],
      posScale: posScales?.[0],
    });
  }
  if (constraint.y !== undefined) {
    applyAlignAxis("y", constraint.y, targets, {
      size: sizes[1],
      posScale: posScales?.[1],
    });
  }
}
