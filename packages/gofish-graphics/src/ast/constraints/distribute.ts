// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import { Axis, ConstraintRef, axisIndex, isPlacedOn } from "./shared";
import { getMeasure, getValue, isValue, type MaybeValue } from "../data";
import {
  CONTINUOUS_TYPE,
  ORDINAL,
  POSITION,
  SIZE,
  UNDEFINED,
  UnderlyingSpace,
  forgetAllMeasures,
  isBaselineMagnitude,
  isPOSITION,
  spaceMeasure,
} from "../underlyingSpace";
import * as Monotonic from "../../util/monotonic";
import * as Interval from "../../util/interval";

export interface DistributeOptions {
  dir: Axis;
  spacing?: number;
  mode?: "edge" | "center";
  order?: "forward" | "reverse";
  /** Stack semantics: glue children together (sizes sum into a POSITION at the
   *  layer) instead of slicing a budget. Forces `spacing` to 0. Mirrors
   *  spread's `glue`. */
  glue?: boolean;
}

export interface DistributeConstraint {
  type: "distribute";
  dir: Axis;
  spacing: number;
  mode: "edge" | "center";
  order: "forward" | "reverse";
  glue: boolean;
  children: ConstraintRef[];
}

export const createDistributeConstraint = (
  options: DistributeOptions,
  children: ConstraintRef[]
): DistributeConstraint => ({
  type: "distribute",
  dir: options.dir,
  // Glue pins spacing ≡ 0 — both for the space fold and for `applyDistribute`'s
  // post-layout placement (which reads this `spacing`), so glued children touch.
  spacing: options.glue ? 0 : (options.spacing ?? 8),
  mode: options.mode ?? "edge",
  order: options.order ?? "forward",
  glue: options.glue ?? false,
  children,
});

/**
 * The distribute constraint's *space-resolution* contribution — the bottom-up
 * half that makes `layer + distribute` claim the same underlying space a
 * `spread` does. Mirrors spread.tsx's stack-axis dispatch exactly (spread's
 * `resolveUnderlyingSpace`), including the explicit-size override and the glue
 * (stack) variant, so phase-3 spread can delegate to it wholesale:
 *
 *  - explicit `opts.size` (a value) → SIZE(linear(value, 0)) — the spread's own
 *    size wins over any children-derived claim.
 *  - glue → POSITION([0, Σ widths]) when all-POSITION; POSITION([0, Σ run(1)])
 *    when all-SIZE; ORDINAL(keys) when any child is keyed; else UNDEFINED.
 *  - non-glue, all-SIZE & data-driven (some non-constant Monotonic) → SIZE
 *    composition (Monotonic.add + spacing·(n−1) for "edge"; the
 *    unknown-Monotonic center form for "center"), so a parent can solve a scale
 *    factor via Monotonic.inverse (auto-fit).
 *  - non-glue, any child keyed → ORDINAL.
 *  - non-glue, all-SIZE constant → SIZE composition.
 *  - non-glue, all-POSITION → POSITION([0, Σ widths]).
 *  - anything else → UNDEFINED (caller falls back to its default union).
 *
 * Measures forget-merge on conflict, like spread. `keys` are the targets'
 * ordinal keys (node.key) in the same order as `targetSpaces`; only used to
 * pick the ORDINAL branch. This is ref-independent (plain arrays) so spread can
 * call it with its positional children and the layer with its name-resolved
 * targets.
 */
export function distributeSpaceFold(
  targetSpaces: UnderlyingSpace[],
  keys: (string | undefined)[],
  opts: {
    spacing: number;
    mode: "edge" | "center";
    glue?: boolean;
    /** Explicit size on the spread/layer's stack axis; overrides children. */
    size?: MaybeValue<number>;
  }
): UnderlyingSpace {
  const n = targetSpaces.length;
  if (n === 0) return UNDEFINED;
  const measure = forgetAllMeasures(targetSpaces.map((s) => spaceMeasure(s)));

  // Explicit size on the stack axis dominates the children-derived claim.
  if (opts.size !== undefined && isValue(opts.size)) {
    return SIZE(
      Monotonic.linear(getValue(opts.size)!, 0),
      getMeasure(opts.size)
    );
  }

  const namedKeys = keys.filter((k): k is string => k !== undefined);
  const spacing = opts.glue ? 0 : opts.spacing;
  // A "free" baseline magnitude (old SIZE) composes its Monotonic + spacing; an
  // anchored data-positioned child (old POSITION) sums its data widths WITHOUT
  // spacing. They are kept distinct — collapsing both into the magnitude path
  // wrongly injected spacing into already-positioned extents.
  const allSize = targetSpaces.every(isBaselineMagnitude);
  const allPosition = targetSpaces.every(isPOSITION);
  const widthAt1 = (s: UnderlyingSpace): number =>
    (s as CONTINUOUS_TYPE).width.run(1);
  const sumWidths = (): number =>
    targetSpaces.map(widthAt1).reduce((a, b) => a + b, 0);

  if (opts.glue) {
    // STACK semantics: collapse children into a single anchored POSITION
    // [0, Σ extent@σ=1] (same total whether they were magnitudes or positioned).
    if (allSize || allPosition) {
      return POSITION(Interval.interval(0, sumWidths()), measure);
    }
    if (namedKeys.length > 0) return ORDINAL(namedKeys);
    return UNDEFINED;
  }

  const childDomains = allSize
    ? targetSpaces.map((s) => (s as CONTINUOUS_TYPE).width)
    : [];
  const dataDriven =
    allSize && childDomains.some((d) => !Monotonic.isConstant(d));
  const composeSize = (): Monotonic.Monotonic =>
    opts.mode === "center"
      ? Monotonic.unknown(
          (scaleFactor: number) =>
            childDomains[0].run(scaleFactor) / 2 +
            spacing * (n - 1) +
            childDomains[childDomains.length - 1].run(scaleFactor) / 2
        )
      : Monotonic.adds(Monotonic.add(...childDomains), spacing * (n - 1));

  if (dataDriven) return SIZE(composeSize(), measure);
  if (namedKeys.length > 0) return ORDINAL(namedKeys);
  if (allSize) return SIZE(composeSize(), measure);
  if (allPosition) return POSITION(Interval.interval(0, sumWidths()), measure);
  return UNDEFINED;
}

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
export type DistributeWalkOptions = Pick<
  DistributeConstraint,
  "dir" | "spacing" | "mode" | "order"
>;

/** One emitted placement equation: the target's `anchor` facet lands at `value`.
 *  `min`/`max`/`center` are the box facets the distribute pins. */
export interface DistributePlacement {
  target: Placeable;
  anchor: "min" | "max" | "center";
  value: number;
}

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

  // Compare a fixed child's actual edge/center against the running expected
  // position and report past tolerance. The anchor itself is never checked —
  // it *defines* the running position, so it is consistent by construction
  // (matches spread's single-forward-walk, which back-computes its origin from
  // the first fixed child).
  const checkInconsistent = (expected: number, actual: number): void => {
    if (onInconsistency && Math.abs(expected - actual) > 1e-6) {
      onInconsistency(expected, actual);
    }
  };

  // Find the first already-placed child (the anchor)
  const anchorIdx = ordered.findIndex((t) => isPlacedOn(t, idx));

  if (anchorIdx === -1) {
    // No pre-placed items — start from 0, walk forward
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
    // Walk forward from anchor (items after it)
    let pos = ordered[anchorIdx].dims[idx].max! + constraint.spacing;
    for (let i = anchorIdx + 1; i < ordered.length; i++) {
      const t = ordered[i];
      if (isPlacedOn(t, idx)) {
        checkInconsistent(pos, t.dims[idx].min!);
        pos = t.dims[idx].max! + constraint.spacing;
      } else {
        out.push({ target: t, anchor: "min", value: pos });
        pos += (t.dims[idx].size ?? 0) + constraint.spacing;
      }
    }
    // Walk backward from anchor (items before it), placing via "max" anchor
    pos = ordered[anchorIdx].dims[idx].min! - constraint.spacing;
    for (let i = anchorIdx - 1; i >= 0; i--) {
      const t = ordered[i];
      if (isPlacedOn(t, idx)) {
        pos = t.dims[idx].min! - constraint.spacing;
      } else {
        out.push({ target: t, anchor: "max", value: pos });
        pos -= (t.dims[idx].size ?? 0) + constraint.spacing;
      }
    }
  } else {
    // center-to-center: same bidirectional pattern using center anchor
    let pos = ordered[anchorIdx].dims[idx].center! + constraint.spacing;
    for (let i = anchorIdx + 1; i < ordered.length; i++) {
      const t = ordered[i];
      if (isPlacedOn(t, idx)) {
        checkInconsistent(pos, t.dims[idx].center!);
        pos = t.dims[idx].center! + constraint.spacing;
      } else {
        out.push({ target: t, anchor: "center", value: pos });
        pos += constraint.spacing;
      }
    }
    pos = ordered[anchorIdx].dims[idx].center! - constraint.spacing;
    for (let i = anchorIdx - 1; i >= 0; i--) {
      const t = ordered[i];
      if (isPlacedOn(t, idx)) {
        pos = t.dims[idx].center! - constraint.spacing;
      } else {
        out.push({ target: t, anchor: "center", value: pos });
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
  for (const p of emitDistribute(constraint, targets, onInconsistency)) {
    p.target.place(constraint.dir, p.value, p.anchor);
  }
}
