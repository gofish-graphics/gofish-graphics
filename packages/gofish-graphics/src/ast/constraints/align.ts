import type { Placeable } from "../_node";
import {
  Alignment,
  Axis,
  ConstraintRef,
  axisIndex,
  isPlacedOn,
} from "./shared";

/**
 * Anchor spec for one axis of an `align` constraint. A single `Alignment`
 * is shared by every child (the common case). An array gives each child its
 * own anchor positionally — `align({x: ["middle", "start"]}, [A, B])` aligns
 * A's center with B's start. The array length must equal `children.length`.
 */
export type AlignAxisSpec = Alignment | Alignment[];

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
const anchorValue = (target: Placeable, idx: 0 | 1, a: Alignment): number =>
  a === "start"
    ? target.dims[idx].min!
    : a === "middle"
      ? target.dims[idx].center!
      : target.dims[idx].max!;

/** Place `target` on `axis` so its anchor `a` lands at `value`. */
const placeAtAnchor = (
  target: Placeable,
  axis: Axis,
  value: number,
  a: Alignment
): void => {
  if (a === "start") target.place(axis, value);
  else if (a === "middle") target.place(axis, value, "center");
  else target.place(axis, value, "max");
};

const fallbackFor = (
  fallback: AlignFallbackBaseline | undefined,
  a: Alignment
): number =>
  (a === "start"
    ? fallback?.start
    : a === "middle"
      ? fallback?.middle
      : fallback?.end) ?? 0;

/** Short label for a placeable in debug logs: name ?? type. */
const dbgLabel = (t: Placeable): string =>
  (t as any)._name ?? (t as any).type ?? "?";

/** Snapshot a placeable's min/center/max on an axis for logging. */
const dbgDims = (t: Placeable, idx: 0 | 1): string => {
  const d = t.dims[idx];
  const f = (n: number | undefined) => (n === undefined ? "·" : n.toFixed(1));
  return `[min=${f(d.min)} ctr=${f(d.center)} max=${f(d.max)} placed=${isPlacedOn(t, idx)}]`;
};

function applyAlignAxis(
  axis: Axis,
  spec: AlignAxisSpec,
  targets: Placeable[],
  fallback?: AlignFallbackBaseline
): void {
  const idx = axisIndex(axis);

  // Normalize to a per-child anchor array.
  let anchors: Alignment[];
  if (Array.isArray(spec)) {
    if (spec.length !== targets.length) {
      throw new Error(
        `Constraint.align: anchor array length ${spec.length} must match number of children ${targets.length}`
      );
    }
    anchors = spec;
  } else {
    anchors = new Array<Alignment>(targets.length).fill(spec);
  }

  console.log(
    `[align ${axis}] anchors=${JSON.stringify(anchors)} targets:`,
    targets.map((t, i) => `${dbgLabel(t)} ${dbgDims(t, idx)}`).join("  ")
  );

  // Baseline = the coordinate the alignment is enforcing. Taken from the
  // first already-placed child, read at *that child's* anchor. With a
  // shared anchor the per-child anchor lookup collapses to the legacy
  // behavior (read .min/.center/.max consistently).
  let baseline: number | undefined;
  for (let i = 0; i < targets.length; i++) {
    if (isPlacedOn(targets[i], idx)) {
      baseline = anchorValue(targets[i], idx, anchors[i]);

      console.log(
        `  ↳ anchor = ${dbgLabel(targets[i])} (placed), baseline=${baseline.toFixed(1)}`
      );
      break;
    }
  }
  if (baseline === undefined) {
    // No placed siblings: fall back to the layer's box baseline.
    baseline = fallbackFor(fallback, anchors[0]);

    console.log(
      `  ↳ no placed sibling, fallback baseline=${baseline.toFixed(1)}`
    );
  }

  for (let i = 0; i < targets.length; i++) {
    if (isPlacedOn(targets[i], idx)) continue;
    placeAtAnchor(targets[i], axis, baseline, anchors[i]);

    console.log(
      `  ↳ placed ${dbgLabel(targets[i])} @${anchors[i]}=${baseline.toFixed(1)} → ${dbgDims(targets[i], idx)}`
    );
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
