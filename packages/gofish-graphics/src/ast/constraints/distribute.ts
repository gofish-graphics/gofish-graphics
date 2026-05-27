import type { Placeable } from "../_node";
import { Axis, ConstraintRef, axisIndex, isPlacedOn } from "./shared";

export interface DistributeOptions {
  dir: Axis;
  spacing?: number;
  mode?: "edge" | "center";
  order?: "forward" | "reverse";
}

export interface DistributeConstraint {
  type: "distribute";
  dir: Axis;
  spacing: number;
  mode: "edge" | "center";
  order: "forward" | "reverse";
  children: ConstraintRef[];
}

export const createDistributeConstraint = (
  options: DistributeOptions,
  children: ConstraintRef[]
): DistributeConstraint => ({
  type: "distribute",
  dir: options.dir,
  spacing: options.spacing ?? 8,
  mode: options.mode ?? "edge",
  order: options.order ?? "forward",
  children,
});

/** Short label for a placeable in debug logs: name ?? type. */
const dbgLabel = (t: Placeable): string =>
  (t as any)._name ?? (t as any).type ?? "?";

/** Snapshot a placeable's min/size/max on an axis for logging. */
const dbgDims = (t: Placeable, idx: 0 | 1): string => {
  const d = t.dims[idx];
  const f = (n: number | undefined) => (n === undefined ? "·" : n.toFixed(1));
  return `[min=${f(d.min)} size=${f(d.size)} max=${f(d.max)} placed=${isPlacedOn(t, idx)}]`;
};

export function applyDistribute(
  constraint: DistributeConstraint,
  targets: Placeable[]
): void {
  const idx = axisIndex(constraint.dir);
  const ordered =
    constraint.order === "reverse" ? [...targets].reverse() : targets;

  // Find the first already-placed child (the anchor)
  const anchorIdx = ordered.findIndex((t) => isPlacedOn(t, idx));

  console.log(
    `[distribute ${constraint.dir} spacing=${constraint.spacing} mode=${constraint.mode}] anchorIdx=${anchorIdx} targets:`,
    ordered.map((t) => `${dbgLabel(t)} ${dbgDims(t, idx)}`).join("  ")
  );
  const logPlaced = (t: Placeable) =>
    console.log(`  ↳ placed ${dbgLabel(t)} → ${dbgDims(t, idx)}`);

  if (anchorIdx === -1) {
    // No pre-placed items — start from 0, walk forward
    let pos = 0;
    for (const target of ordered) {
      if (constraint.mode === "center") {
        target.place(constraint.dir, pos, "center");
        pos += constraint.spacing;
      } else {
        target.place(constraint.dir, pos);
        pos += (target.dims[idx].size ?? 0) + constraint.spacing;
      }
      logPlaced(target);
    }
    return;
  }

  if (constraint.mode === "edge") {
    // Walk forward from anchor (items after it)
    let pos = ordered[anchorIdx].dims[idx].max! + constraint.spacing;
    for (let i = anchorIdx + 1; i < ordered.length; i++) {
      const t = ordered[i];
      if (isPlacedOn(t, idx)) {
        pos = t.dims[idx].max! + constraint.spacing;
      } else {
        t.place(constraint.dir, pos);
        pos += (t.dims[idx].size ?? 0) + constraint.spacing;
        logPlaced(t);
      }
    }
    // Walk backward from anchor (items before it), placing via "max" anchor
    pos = ordered[anchorIdx].dims[idx].min! - constraint.spacing;
    for (let i = anchorIdx - 1; i >= 0; i--) {
      const t = ordered[i];
      if (isPlacedOn(t, idx)) {
        pos = t.dims[idx].min! - constraint.spacing;
      } else {
        t.place(constraint.dir, pos, "max");
        pos -= (t.dims[idx].size ?? 0) + constraint.spacing;
        logPlaced(t);
      }
    }
  } else {
    // center-to-center: same bidirectional pattern using center anchor
    let pos = ordered[anchorIdx].dims[idx].center! + constraint.spacing;
    for (let i = anchorIdx + 1; i < ordered.length; i++) {
      const t = ordered[i];
      if (isPlacedOn(t, idx)) {
        pos = t.dims[idx].center! + constraint.spacing;
      } else {
        t.place(constraint.dir, pos, "center");
        pos += constraint.spacing;
        logPlaced(t);
      }
    }
    pos = ordered[anchorIdx].dims[idx].center! - constraint.spacing;
    for (let i = anchorIdx - 1; i >= 0; i--) {
      const t = ordered[i];
      if (isPlacedOn(t, idx)) {
        pos = t.dims[idx].center! - constraint.spacing;
      } else {
        t.place(constraint.dir, pos, "center");
        pos -= constraint.spacing;
        logPlaced(t);
      }
    }
  }
}
