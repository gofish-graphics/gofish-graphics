import type { MaybeValue, PositionValue } from "../data";
import type { PlacementFactEmitter } from "./placementFacts";
import type { AlignAnchor, Axis, ConstraintRef } from "./shared";

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
  x?: PositionValue;
  y?: PositionValue;
  /** Which anchor of the target lands on the coordinate. Defaults to "middle"
   *  (the target's center sits on the value), matching how `scatter`/`position`
   *  place marks at their center. `"baseline"` pins the target's origin. */
  anchor?: AlignAnchor;
  /** Authoritative pin: also reposition a target that ALREADY self-placed during
   *  its own layout (a Frame / coord glyph arrives with a translate, which makes
   *  the write-once `place()` a no-op). Set by `scatter`, whose `x`/`y` ARE the
   *  child's placement. Off (default) for axis/pie/legend pins, where a
   *  pre-placed target keeps its position (the write-once no-op).
   *
   *  Interim: once #39's linsys ledger ({@link BBox}) becomes the node's actual
   *  dimension state, per-equation ownership subsumes this — a pin would simply
   *  own the position facet, and a second writer would be a named conflict
   *  rather than a silent no-op needing a per-call opt-out. */
  override?: boolean;
}

export interface PositionConstraint {
  type: "position";
  x?: PositionValue;
  y?: PositionValue;
  anchor: AlignAnchor;
  override: boolean;
  children: ConstraintRef[];
}

export const createPositionConstraint = (
  { x, y, anchor, override }: PositionOptions,
  children: ConstraintRef[]
): PositionConstraint => {
  if (x === undefined && y === undefined) {
    throw new Error(
      "Constraint.position: at least one of `x` or `y` must be specified"
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
  const emit = (axis: Axis, coordinate: PositionValue | undefined) => {
    if (coordinate === undefined) return;
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
