import type { Placeable } from "../_node";
import { isValue, MaybeValue } from "../data";
import { computeAesthetic } from "../../util";
import { placeAtAnchor } from "./align";
import {
  AlignAnchor,
  Axis,
  ConstraintPosScales,
  ConstraintRef,
  axisIndex,
} from "./shared";

/**
 * Options for a `position` constraint. Mirrors how you position a shape (or use
 * the `position` operator): give an `x` and/or `y` that is either a **literal**
 * pixel coordinate or a **datum** (`datum(n)` / `value(n)`). A literal is placed
 * as-is; a datum is mapped through the layer's position scale — which the layer
 * derives from the datum coordinates of its `position` constraints (their union
 * is the layer's POSITION domain on that axis). At least one of `x`/`y` is
 * required.
 */
export interface PositionOptions {
  x?: MaybeValue<number>;
  y?: MaybeValue<number>;
  /** Which anchor of the target lands on the coordinate. Defaults to "middle"
   *  (the target's center sits on the value), matching how `scatter`/`position`
   *  place marks at their center. `"baseline"` pins the target's origin. */
  anchor?: AlignAnchor;
}

export interface PositionConstraint {
  type: "position";
  x?: MaybeValue<number>;
  y?: MaybeValue<number>;
  anchor: AlignAnchor;
  children: ConstraintRef[];
}

export const createPositionConstraint = (
  { x, y, anchor }: PositionOptions,
  children: ConstraintRef[]
): PositionConstraint => {
  if (x === undefined && y === undefined) {
    throw new Error(
      "Constraint.position: at least one of `x` or `y` must be specified"
    );
  }
  return { type: "position", x, y, anchor: anchor ?? "middle", children };
};

/**
 * Apply a `position` constraint: for each specified axis, place every target so
 * its `anchor` sits at the resolved pixel coordinate — a literal value as-is, a
 * datum value mapped through that axis's `posScale`. A datum on an axis with no
 * scale (the layer has no POSITION domain there) is a no-op.
 */
export function applyPosition(
  constraint: PositionConstraint,
  targets: Placeable[],
  posScales: ConstraintPosScales | undefined
): void {
  const placeAxis = (axis: Axis, coord: MaybeValue<number> | undefined) => {
    if (coord === undefined) return;
    const scale = posScales?.[axisIndex(axis)];
    // A datum on an axis with no scale is a no-op; a literal needs no scale.
    if (isValue(coord) && scale === undefined) return;
    const px = computeAesthetic(coord, scale!, undefined)!;
    for (const target of targets) {
      placeAtAnchor(target, axis, px, constraint.anchor);
    }
  };
  placeAxis("x", constraint.x);
  placeAxis("y", constraint.y);
}
