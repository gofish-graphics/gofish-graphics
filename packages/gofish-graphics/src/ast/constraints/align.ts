import type { Placeable } from "../_node";
import {
  AlignAnchor,
  Axis,
  ConstraintRef,
  axisIndex,
  isPlacedOn,
} from "./shared";

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
  const idx = axisIndex(axis);

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

  // Baseline = the coordinate the alignment is enforcing. Taken from the
  // first already-placed child, read at *that child's* anchor. With a
  // shared anchor the per-child anchor lookup collapses to the legacy
  // behavior (read .min/.center/.max consistently).
  let baseline: number | undefined;
  for (let i = 0; i < targets.length; i++) {
    if (isPlacedOn(targets[i], idx)) {
      baseline = anchorValue(targets[i], idx, anchors[i]);
      break;
    }
  }
  if (baseline === undefined) {
    // No placed siblings: fall back to the layer's box baseline.
    baseline = fallbackFor(fallback, anchors[0]);
  }

  for (let i = 0; i < targets.length; i++) {
    if (isPlacedOn(targets[i], idx)) continue;
    placeAtAnchor(targets[i], axis, baseline, anchors[i]);
  }
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
