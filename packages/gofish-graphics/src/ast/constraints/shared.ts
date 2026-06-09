import type { Placeable } from "../_node";

export type Axis = "x" | "y";
export type Alignment = "start" | "middle" | "end";

/** Lightweight handle for referencing a named child inside .constrain() */
export type ConstraintRef = { readonly name: string };

/** Per-axis data→pixel position scales, as built by `layer.tsx` and consumed
 *  by `Constraint.position` (a literal coordinate is a raw pixel; a `datum`
 *  coordinate is mapped through the matching scale). */
export type ConstraintPosScales = [
  ((value: number) => number) | undefined,
  ((value: number) => number) | undefined,
];

/** Convert axis name to dimension index (0 = x, 1 = y) */
export const axisIndex = (axis: Axis): 0 | 1 => (axis === "x" ? 0 : 1);

/** Check if a placeable has been placed on a given axis */
export const isPlacedOn = (p: Placeable, axisIdx: 0 | 1): boolean =>
  p.dims[axisIdx].min !== undefined;
