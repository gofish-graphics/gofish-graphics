import {
  isDiscretePosition,
  type MaybeValue,
  type PositionValue,
} from "../data";
import type { PlacementFactEmitter } from "./placementFacts";
import type { AlignAnchor, Axis, ConstraintRef } from "./shared";

/** The **interval** form of a position coordinate: pin the target's min edge at
 *  `[0]` and its max edge at `[1]`, letting the two edges DETERMINE the size
 *  (#39/#546). Endpoints are pixel literals or datums (`value(n)`), never
 *  discrete positions. Lowers to the edge-pin + extent path (see `span.ts`). */
export type PositionInterval = [MaybeValue<number>, MaybeValue<number>];

/** Distinguish a position coordinate's interval form (a two-element array) from
 *  its point form. Point coordinates (`number` / `Value` / `DiscretePosition`)
 *  are never arrays, so this test is exact. */
export const isPositionInterval = (
  coord: PositionValue | PositionInterval | undefined
): coord is PositionInterval => Array.isArray(coord);

/**
 * Options for a `position` constraint. Mirrors how you position a shape (or use
 * the `position` operator): give an `x` and/or `y` that is either
 *   - a **point**: a **literal** pixel coordinate or a **datum**
 *     (`datum(n)` / `value(n)`); a literal is placed as-is, a datum maps
 *     through the layer's position scale; OR
 *   - an **interval** `[min, max]`: two edges that pin the target and DETERMINE
 *     its size (the size-setting range form; each endpoint is a pixel literal
 *     or a datum, never a discrete position).
 * The layer derives its POSITION domain from the datum coordinates of its
 * `position` constraints (point values plus interval endpoints). At least one
 * of `x`/`y` is required.
 */
export interface PositionOptions {
  x?: PositionValue | PositionInterval;
  y?: PositionValue | PositionInterval;
  /** Which anchor of the target lands on the coordinate. Defaults to "middle"
   *  (the target's center sits on the value), matching how `scatter`/`position`
   *  place marks at their center. `"baseline"` pins the target's origin.
   *  Point form only — an interval coordinate pins both edges itself. */
  anchor?: AlignAnchor;
  /** Authoritative pin: also reposition a target that ALREADY self-placed during
   *  its own layout (a Frame / coord glyph arrives with a translate, which makes
   *  the write-once `place()` a no-op). Set by `scatter`, whose `x`/`y` ARE the
   *  child's placement. Off (default) for axis/pie/legend pins, where a
   *  pre-placed target keeps its position (the write-once no-op). Point form
   *  only — an interval coordinate already sets the target's extent.
   *
   *  Interim: once #39's linsys ledger ({@link BBox}) becomes the node's actual
   *  dimension state, per-equation ownership subsumes this — a pin would simply
   *  own the position facet, and a second writer would be a named conflict
   *  rather than a silent no-op needing a per-call opt-out. */
  override?: boolean;
}

export interface PositionConstraint {
  type: "position";
  x?: PositionValue | PositionInterval;
  y?: PositionValue | PositionInterval;
  anchor: AlignAnchor;
  override: boolean;
  children: ConstraintRef[];
}

const validateInterval = (axis: Axis, interval: PositionInterval): void => {
  for (const endpoint of interval) {
    if (isDiscretePosition(endpoint)) {
      throw new Error(
        `Constraint.position: interval \`${axis}\` endpoints must be pixel ` +
          `literals or datums, not discrete positions`
      );
    }
  }
};

export const createPositionConstraint = (
  { x, y, anchor, override }: PositionOptions,
  children: ConstraintRef[]
): PositionConstraint => {
  if (x === undefined && y === undefined) {
    throw new Error(
      "Constraint.position: at least one of `x` or `y` must be specified"
    );
  }
  if (isPositionInterval(x)) validateInterval("x", x);
  if (isPositionInterval(y)) validateInterval("y", y);
  // `override` is a point-form no-op-escape: it repositions a self-placed
  // target. An interval already sets the target's extent, so the combination is
  // meaningless — reject it rather than silently ignore.
  if ((override ?? false) && (isPositionInterval(x) || isPositionInterval(y))) {
    throw new Error(
      "Constraint.position: `override` applies to point coordinates only, " +
        "not interval `[min, max]` coordinates"
    );
  }
  return {
    type: "position",
    x,
    y,
    anchor: anchor ?? "middle",
    override: override ?? false,
    children,
  };
};

export function lowerPositionPlacement(
  constraint: PositionConstraint,
  owner: string,
  {
    emitter,
    targets,
    isInitiallyPlaced,
    resolveCoordinate,
  }: {
    emitter: PlacementFactEmitter;
    targets: Map<string, unknown>;
    isInitiallyPlaced: (axis: Axis, name: string) => boolean;
    resolveCoordinate: (
      axis: Axis,
      coordinate: PositionValue
    ) => number | undefined;
  }
): void {
  const emit = (
    axis: Axis,
    coordinate: PositionValue | PositionInterval | undefined
  ) => {
    // Interval coordinates lower to edge pins (span.ts), not a single point pin.
    if (coordinate === undefined || isPositionInterval(coordinate)) return;
    const value = resolveCoordinate(axis, coordinate);
    if (value === undefined) return;
    for (const child of constraint.children) {
      const target = targets.get(child.name);
      if (!target) continue;
      if (isInitiallyPlaced(axis, child.name) && !constraint.override) continue;
      emitter.pin({
        axis,
        target: { name: child.name, anchor: constraint.anchor },
        value,
        owner,
      });
    }
  };
  emit("x", constraint.x);
  emit("y", constraint.y);
}
