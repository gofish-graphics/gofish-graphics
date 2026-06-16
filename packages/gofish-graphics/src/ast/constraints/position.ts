import type { Anchor } from "../dims";
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

/** The align-vocabulary anchor (`start`/`middle`/`end`/`baseline`) as the box
 *  anchor a node pins to (`min`/`center`/`max`/`baseline`). The same mapping
 *  `placeAtAnchor` applies for the write-once path. */
const toBoxAnchor: Record<AlignAnchor, Anchor> = {
  start: "min",
  middle: "center",
  end: "max",
  baseline: "baseline",
};

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
 * `place()`'s no-op. The pin must win, so OVERRIDE via `pinAnchor`, which lands
 * the anchor at `px` and REBUILDS the ledger (start→min, middle→center,
 * end→max, baseline→origin) — every override goes through the ledger, including
 * `baseline`, so no reader sees a stale self-placement.
 */
function placePinned(
  target: Placeable,
  axis: Axis,
  px: number,
  anchor: AlignAnchor,
  override: boolean
): void {
  // Is the target already placed on this axis? Stage 3 (#39): detect it via the
  // ledger-backed `dims.min`, not the raw `transform.translate` — a node placed
  // by a pin or self-placing operator now records the ledger and clears the
  // written translate, so reading translate would miss it.
  if (!override || target.dims?.[axisIndex(axis)]?.min === undefined) {
    placeAtAnchor(target, axis, px, anchor);
    return;
  }
  // Authoritative override of a self-placed target: one ledger-recording pin for
  // every anchor (origin/min/center/max). A single owned facet ⇒ rank-1 pin —
  // keep the local box, move the translate, rebuilding the ledger so the override
  // wins over the self-placement.
  target.pinAnchor!(axis, px, toBoxAnchor[anchor]);
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

/** One emitted position equation: the target's `anchor` lands at `value` px on
 *  `axis`. */
export interface PositionPlacement {
  target: Placeable;
  axis: Axis;
  anchor: AlignAnchor;
  value: number;
}

/**
 * EMIT a `position` constraint as facet-placement equations (#39 facet-equation-
 * emitter form) WITHOUT applying them: for each specified axis, every target's
 * `anchor` lands at the resolved pixel — a literal as-is, a datum mapped through
 * that axis's `posScale`. A datum on a scale-less axis is a no-op (skipped).
 * Pure: it only resolves the coordinate, no placement state read.
 */
export function emitPosition(
  constraint: PositionConstraint,
  targets: Placeable[],
  posScales: ConstraintPosScales | undefined
): PositionPlacement[] {
  const out: PositionPlacement[] = [];
  const emitAxis = (axis: Axis, coord: MaybeValue<number> | undefined) => {
    if (coord === undefined) return;
    const scale = posScales?.[axisIndex(axis)];
    // A datum on an axis with no scale is a no-op; a literal needs no scale.
    if (isValue(coord) && scale === undefined) return;
    const px = computeAesthetic(coord, scale!, undefined)!;
    for (const target of targets)
      out.push({ target, axis, anchor: constraint.anchor, value: px });
  };
  emitAxis("x", constraint.x);
  emitAxis("y", constraint.y);
  return out;
}

/**
 * Commit the emitted position equations: pin each target's anchor at its pixel.
 * `placePinned` carries the authoritative-`override` detail (scatter
 * repositioning a self-placed target). The emit/commit seam is where a per-scope
 * solver slots in (consume {@link emitPosition} instead of pinning here).
 */
export function applyPosition(
  constraint: PositionConstraint,
  targets: Placeable[],
  posScales: ConstraintPosScales | undefined
): void {
  for (const p of emitPosition(constraint, targets, posScales))
    placePinned(p.target, p.axis, p.value, p.anchor, constraint.override);
}
