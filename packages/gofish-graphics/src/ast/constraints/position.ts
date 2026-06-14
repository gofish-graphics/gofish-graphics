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
 * Place `target` on `axis` so its `anchor` lands at pixel `px`. A `position`
 * constraint is an authoritative pin (one owner per target/axis).
 *
 * Default (`override` false) is exactly `placeAtAnchor` (the write-once
 * `place()`): unchanged behavior for axis / pie / legend pins, including their
 * already-placed targets (a 2nd write is a no-op).
 *
 * With `override` (set by `scatter`, whose `x`/`y` ARE the placement): an
 * already-placed target — one that self-placed during its OWN layout (e.g. a
 * Frame / coord glyph arrives with a translate) — would be stranded by
 * `place()`'s no-op. The pin must win, so OVERRIDE: compute the additive delta
 * from the target's current anchor (intrinsicDims + translate) and rewrite the
 * translate so the anchor lands at `px` (the arithmetic the bespoke scatter
 * used). Anchor maps start→min, middle→center, end→max, baseline→origin.
 */
function placePinned(
  target: Placeable,
  axis: Axis,
  px: number,
  anchor: AlignAnchor,
  override: boolean
): void {
  if (
    !override ||
    target.transform?.translate?.[axisIndex(axis)] === undefined
  ) {
    placeAtAnchor(target, axis, px, anchor);
    return;
  }
  // Authoritative override of a self-placed target. The origin (`baseline`) is
  // pinned directly; the box anchors go through the bbox-backed `setExtent`
  // (a single owned facet ⇒ rank-1 pin: keep the local box, move the translate).
  if (anchor === "baseline") {
    target.transform!.translate![axisIndex(axis)] = px;
    return;
  }
  const facet =
    anchor === "start" ? "min" : anchor === "end" ? "max" : "center";
  target.setExtent!(axis, { [facet]: px }, "position");
}

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
  x?: MaybeValue<number>;
  y?: MaybeValue<number>;
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
      placePinned(target, axis, px, constraint.anchor, constraint.override);
    }
  };
  placeAxis("x", constraint.x);
  placeAxis("y", constraint.y);
}
