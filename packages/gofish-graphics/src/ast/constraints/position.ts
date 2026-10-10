// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import {
  getValue,
  isDiscretePosition,
  isValue,
  type MaybeValue,
  type PositionValue,
} from "../data";
import * as Interval from "../../util/interval";
import type { Cell } from "../cells";
import type { PlacementFactEmitter } from "./placementFacts";
import type { AlignAnchor, Axis, ConstraintRef } from "./shared";

/** The **interval** form of a position coordinate: pin the target's `start`
 *  (min) edge at `[0]` and its `end` (max) edge at `[1]`, letting the two edges
 *  DETERMINE the size (#39/#546). Both edges lower to ordinary strong anchor
 *  pins, so the rank-2 cell closure resolves the size (`max − min`). Endpoints
 *  are pixel literals or datums (`value(n)`), never discrete positions. */
export type PositionInterval = [MaybeValue<number>, MaybeValue<number>];

/** Distinguish a position coordinate's interval form (a two-element array) from
 *  its point form. Point coordinates (`number` / `Value` / `DiscretePosition`)
 *  are never arrays, so this test is exact. */
export const isPositionInterval = (
  coord: PositionValue | PositionInterval | PositionRegion | undefined
): coord is PositionInterval => Array.isArray(coord);

/**
 * The **region** form of a position coordinate (#1059): the cell of the key a
 * `partition` grouped by, which the layer hands the target as the REGION it
 * is laid out in (`geometry/region.ts`). It is not a pin. At layout the
 * layer maps the cell's edges to a pixel span (`buildChildRegions`) and
 * passes it in the target's layout call, and the target places itself in it:
 * a mark with no size of its own on this axis (a rect, a `region`) fills the
 * cell, and a mark with a size of its own (a circle, a text) sits in the
 * middle of it. An interval instead pins both edges, and so sets the
 * target's size whatever it is.
 *
 * `edges` are the cell's start and end as datums of the column it bins, so
 * they carry the column's measure and type (a time column's calendar) as any
 * datum read from it does, and they make the layer's position domain on this
 * axis. The cell tells an axis over such regions that it places cells
 * (`CONTINUOUS_TYPE.cells`).
 *
 * `outline` is the cell's outline in data, `[x, y]` per vertex, for a cell
 * that is not a box (a hexagon, a Voronoi cell). It is on both axes'
 * coordinates of a two-axis cell; the layer maps it through both scales.
 * Nothing makes one yet: `Bin.hex` and `Bin.voronoi` will (#1059 part B).
 */
export class PositionRegion {
  constructor(
    readonly cell: Cell,
    readonly edges: PositionInterval,
    readonly outline?: readonly (readonly [
      MaybeValue<number>,
      MaybeValue<number>,
    ])[]
  ) {}
}

export const isPositionRegion = (coord: unknown): coord is PositionRegion =>
  coord instanceof PositionRegion;

/** Any position coordinate: a point, an interval, or a region. */
export type PositionCoordinate =
  | PositionValue
  | PositionInterval
  | PositionRegion;

/** The two edges a coordinate spans on its axis: an interval's own, or a
 *  region's cell edges. A point spans none. */
export const coordinateSpan = (
  coord: PositionCoordinate | undefined
): PositionInterval | undefined =>
  isPositionInterval(coord)
    ? coord
    : isPositionRegion(coord)
      ? coord.edges
      : undefined;

/**
 * Options for a `position` constraint. Mirrors how you position a shape (or use
 * the `position` operator): give an `x` and/or `y` that is either
 *   - a **point**: a **literal** pixel coordinate or a **datum**
 *     (`datum(n)` / `value(n)`); a literal is placed as-is, a datum maps
 *     through the layer's position scale; OR
 *   - an **interval** `[min, max]`: two edges that pin the target and DETERMINE
 *     its size (the size-setting range form; each endpoint is a pixel literal
 *     or a datum, never a discrete position); OR
 *   - a **region** ({@link PositionRegion}): a cell the layer hands the target
 *     as the region it lays itself out in.
 * The layer derives its POSITION domain from the datum coordinates of its
 * `position` constraints (point values plus interval and region edges). At least one
 * of `x`/`y` is required.
 */
export interface PositionOptions {
  x?: PositionCoordinate;
  y?: PositionCoordinate;
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
   *  own the position anchor, and a second writer would be a named conflict
   *  rather than a silent no-op needing a per-call opt-out. */
  override?: boolean;
}

export interface PositionConstraint {
  type: "position";
  x?: PositionCoordinate;
  y?: PositionCoordinate;
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
  const spanX = coordinateSpan(x);
  const spanY = coordinateSpan(y);
  if (spanX !== undefined) validateInterval("x", spanX);
  if (spanY !== undefined) validateInterval("y", spanY);
  // `override` is a point-form no-op-escape: it repositions a self-placed
  // target. An interval or a region already places the target outright, so
  // the combination is meaningless — reject it rather than silently ignore.
  if ((override ?? false) && (spanX !== undefined || spanY !== undefined)) {
    throw new Error(
      "Constraint.position: `override` applies to point coordinates only, " +
        "not interval `[min, max]` or region coordinates"
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

/** Each endpoint contributes its datum value to the axis's POSITION domain
 *  (parallel to point coordinates in `collectPositionDomains`), so the layer
 *  builds a posScale that covers the spanned range. Literal-pixel endpoints are
 *  not data and don't contribute. */
export function spanDatumInterval(
  span: PositionInterval | undefined
): Interval.Interval | undefined {
  if (span === undefined) return undefined;
  const vals = span.filter(isValue).map((v) => getValue(v)!);
  if (vals.length === 0) return undefined;
  return Interval.interval(Math.min(...vals), Math.max(...vals));
}

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
  const emit = (axis: Axis, coordinate: PositionCoordinate | undefined) => {
    if (coordinate === undefined) return;
    // Region form: nothing to pin. The layer handed the target the region in
    // its layout call, and the target placed itself there.
    if (isPositionRegion(coordinate)) return;
    // Interval form: pin BOTH edges (start=min, end=max) as strong anchor pins.
    // Two edges are rank 2, so cell closure determines the size — the extent
    // that a size-setting range needs, which a single point pin cannot express.
    // Not gated by `isInitiallyPlaced`: an interval authoritatively sets the
    // target's extent (as `setExtent` does), overriding a self-placed layout.
    if (isPositionInterval(coordinate)) {
      const min = resolveCoordinate(axis, coordinate[0]);
      const max = resolveCoordinate(axis, coordinate[1]);
      if (min === undefined || max === undefined) return;
      for (const child of constraint.children) {
        if (!targets.get(child.name)) continue;
        emitter.pin({
          axis,
          target: { name: child.name, anchor: "start" },
          value: min,
          owner,
        });
        emitter.pin({
          axis,
          target: { name: child.name, anchor: "end" },
          value: max,
          owner,
        });
      }
      return;
    }
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
