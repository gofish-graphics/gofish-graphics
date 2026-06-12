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

/** Per-axis environment threaded to a fallback policy: the layer's box size on
 *  this axis and the axis's data→pixel position scale (if any). The two
 *  fallback policies below each consume a different part of this env, so they
 *  can sit side by side as pure functions of `(anchor, size, posScale)`. */
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
  fallback: (anchor: AlignAnchor, env: AlignAxisEnv) => number;
}

/**
 * Fallback baseline for the `align` *constraint* path: the layer's own box
 * edge. start→0, middle→size/2, end→size, baseline→0 (the layer's origin).
 * Ignores `posScale` — axis-title elaboration relies on a title pinning to the
 * plot box, not the data scale. NOTE: an unsized axis carries a NaN `size`, so
 * middle/end yield NaN here exactly as the layer's literal `size/2` / `size`
 * would; no finite-guard is applied (behavior is bit-identical to the old
 * `fallbackFor` reading a `{start:0, middle:size/2, end:size}` literal).
 */
export function constraintFallbackBaseline(
  anchor: AlignAnchor,
  size: number,
  _posScale: ((v: number) => number) | undefined
): number {
  return anchor === "start"
    ? 0
    : anchor === "middle"
      ? size / 2
      : anchor === "baseline"
        ? 0
        : size;
}

/**
 * Fallback baseline for *spread*'s cross-axis alignment: the data scale's
 * origin. middle→size/2; otherwise `posScale(0)` (the scale's zero), or 0 with
 * no scale. A SIZE-derived cross axis thus aligns at the scale's zero, not the
 * box edge.
 */
export function spreadFallbackBaseline(
  anchor: AlignAnchor,
  size: number,
  posScale: ((v: number) => number) | undefined
): number {
  return anchor === "middle" ? size / 2 : posScale ? posScale(0) : 0;
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
  if (baseline === undefined) baseline = policy.fallback(anchors[0], env);

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

  // Layer-box policy: read a placed sibling's real extent/origin; with no
  // placed sibling, fall back to the layer's own box baseline.
  alignTargets(
    targets,
    axis,
    anchors,
    {
      readPlaced: anchorValue,
      fallback: (anchor, env) =>
        constraintFallbackBaseline(anchor, env.size, env.posScale),
    },
    env
  );
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
