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

export function applyDistribute(
  constraint: DistributeConstraint,
  targets: Placeable[]
): void {
  const idx = axisIndex(constraint.dir);
  const ordered =
    constraint.order === "reverse" ? [...targets].reverse() : targets;

  // Find the first already-placed child (the anchor)
  const anchorIdx = ordered.findIndex((t) => isPlacedOn(t, idx));

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
      }
    }
  }
}
