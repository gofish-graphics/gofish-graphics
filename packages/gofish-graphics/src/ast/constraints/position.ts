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
import type { Cell, RegionCell } from "../cells";
import type { PlacementFactEmitter } from "./placementFacts";
import {
  SlotOperand,
  type AlignAnchor,
  type Axis,
  type ConstraintRef,
  type KeyOf,
} from "./shared";
import type { GoFishNode } from "../_node";
import { resolution } from "../_ref";

/** The **interval** form of a position coordinate: pin the target's `start`
 *  (min) edge at `[0]` and its `end` (max) edge at `[1]`, letting the two edges
 *  DETERMINE the size (#39/#546). Both edges lower to ordinary strong anchor
 *  pins, so the rank-2 cell closure resolves the size (`max − min`). Endpoints
 *  are pixel literals or datums (`value(n)`), never discrete positions. */
export type PositionInterval = [MaybeValue<number>, MaybeValue<number>];

/** A point or interval position coordinate: what pins a target. */
export type PositionCoordinate = PositionValue | PositionInterval;

/** Distinguish a position coordinate's interval form (a two-element array) from
 *  its point form. Point coordinates (`number` / `Value` / `DiscretePosition`)
 *  are never arrays, so this test is exact. */
export const isPositionInterval = (
  coord: PositionCoordinate | undefined
): coord is PositionInterval => Array.isArray(coord);

/** How a position coordinate places its target on an axis (#1114): by a
 *  literal pixel value (a number, or an interval whose endpoints are all
 *  numbers), which places the target elsewhere, so it is detached there; or
 *  by a datum (a datum point, or an interval with a datum endpoint), which
 *  keeps it in its layer's set, nested at the datum. Undefined for no
 *  coordinate, and for a discrete position, which takes no part. Read by the
 *  sharing plan (`planSharing`) and by the `position` operator. */
export const positionCoordKind = (
  coord: PositionValue | PositionInterval | undefined
): "pixel" | "datum" | undefined => {
  if (isPositionInterval(coord))
    return coord.some((e) => isValue(e)) ? "datum" : "pixel";
  if (typeof coord === "number") return "pixel";
  return isValue(coord) ? "datum" : undefined;
};
/** A value along a column, as the datum read from that column: it carries
 *  the column's measure and type (a time column's calendar). */
export type ColumnDatum = (v: number) => MaybeValue<number>;

/**
 * The **region** a `position` constraint gives its target (#1059): the cell
 * of the key a `partition` grouped by. It is not a pin. The layer lays the
 * target out in the cell's length on each axis the cell spans
 * (`buildChildSpans`) and centers it there (`lowerPositionPlacement`): a
 * mark with no size of its own on an axis (a rect) fills the cell there, and
 * a mark with a size of its own (a circle, a text) sits in the middle of it.
 * A target its data places in the layer's frame (a `region` mark, which
 * reads its cell with {@link enclosingCell}) is in its cell already. An
 * interval instead pins both edges, and so sets the target's size whatever
 * it is.
 *
 * `columns` names, per axis, the column the cell is placed along there, as
 * a map from a value to its datum. A cell of a line ({@link Cell}) is placed
 * along one axis, the partition's `dir`; a cell of the plane (a hexagon of
 * `Bin.hex`, a cell of `Bin.voronoi`) along both. The region reads the cell
 * through them once: `spans` holds, per axis, the cell's two edges as datums
 * of its column, so they carry the column's measure and type as any datum
 * read from it does, and they make the layer's position domain on that axis.
 * `outline` is the cell's outline in datums, `[x, y]` per corner, when the
 * cell has one and is placed along both axes.
 *
 * A partition inside another partition's cell divides that cell. On each
 * axis its key does not place, the region's span is the span of the cell
 * the partition is in (`enclosing`), so its child is placed there as a child
 * of the outer partition is. `placed` says which axes the key places: only
 * those make the layer's cells there (`collectPositionDomains`), since an
 * enclosing cell is the outer partition's, and its axis draws it.
 * TODO(#1059): the outline is the key's own, so a 1D partition inside a
 * hexagon gives its children the hexagon's box, cut down to their cells,
 * and not the hexagon clipped to them.
 */
export class PositionRegion {
  readonly spans: readonly [
    PositionInterval | undefined,
    PositionInterval | undefined,
  ];
  readonly outline?: readonly (readonly [
    MaybeValue<number>,
    MaybeValue<number>,
  ])[];
  /** Per axis, whether the key places the cell there. */
  readonly placed: readonly [boolean, boolean];

  constructor(
    readonly cell: RegionCell,
    columns: readonly [ColumnDatum | undefined, ColumnDatum | undefined],
    enclosing?: PositionRegion
  ) {
    const [x, y] = columns;
    const along = (axis: 0 | 1): PositionInterval | undefined => {
      const datum = columns[axis];
      if (datum === undefined) return enclosing?.spans[axis];
      const [a, b] = cell.span(axis);
      return [datum(a), datum(b)];
    };
    this.spans = [along(0), along(1)];
    this.placed = [x !== undefined, y !== undefined];
    this.outline =
      x === undefined || y === undefined
        ? undefined
        : cell.outline?.map(([px, py]) => [x(px), y(py)] as const);
  }
}

/**
 * The cell `node` is in: the region a `position` constraint gives the
 * nearest of it and its ancestors that one names, or undefined. A partition
 * gives each child its cell that way, and a partition inside another's cell
 * gives its children that cell on the axes it does not divide
 * ({@link PositionRegion}), so the nearest region is the whole cell.
 *
 * TODO: the cell is the outer partition's, in its frame, but a node between
 * may map its axis in a frame of its own (a row with a size of its own whose
 * content is placed by other data), and then the cell's span is read there
 * in the wrong frame (region.test.ts, "a cell is not read across a frame of
 * its own"). Whether a node has a frame of its own is decided at layout
 * (`solveLayerScales`), after this runs.
 */
// TODO(perf): enclosingCell scans the parent's constraints per lookup, so N
// cells cost O(N²); a name→region map recorded by partition would make it
// O(depth). Matters only for plane partitions of thousands of cells.
export function enclosingCell(node: GoFishNode): PositionRegion | undefined {
  // A partition's region operand is its slot handle, which names its child
  // before the round resolves the references (the partitions run top-down,
  // in the pass before it). A name operand (a user's `.relate()`) is read as
  // the last round resolved it.
  for (let at = node; at.parent !== undefined; at = at.parent) {
    const parent = at.parent;
    const means = (ref: ConstraintRef) =>
      ref instanceof SlotOperand
        ? ref.child(parent) === at
        : resolution(parent).keyOf(ref) === at.uid;
    for (const c of parent.constraints) {
      if (c.type !== "position" || c.region === undefined) continue;
      if (c.children.some(means)) return c.region;
    }
  }
  return undefined;
}

/** Every coordinate a position constraint gives on `axis`: its point or
 *  interval there, and its region's span there. */
export const axisCoordinates = (
  c: PositionConstraint,
  axis: 0 | 1
): PositionCoordinate[] =>
  [axis === 0 ? c.x : c.y, c.region?.spans[axis]].filter(
    (coord): coord is PositionCoordinate => coord !== undefined
  );

/**
 * Options for a `position` constraint. Mirrors how you position a shape (or use
 * the `position` operator): give an `x` and/or `y` that is either
 *   - a **point**: a **literal** pixel coordinate or a **datum**
 *     (`datum(n)` / `value(n)`); a literal is placed as-is, a datum maps
 *     through the layer's position scale; OR
 *   - an **interval** `[min, max]`: two edges that pin the target and DETERMINE
 *     its size (the size-setting range form; each endpoint is a pixel literal
 *     or a datum, never a discrete position).
 * A `region` ({@link PositionRegion}) instead gives the target a cell, which
 * the layer lays it out in and centers it in.
 * The layer derives its POSITION domain from the datum coordinates of its
 * `position` constraints (point values plus interval and region edges). At
 * least one of `x`, `y`, and `region` is required.
 */
export interface PositionOptions {
  x?: PositionCoordinate;
  y?: PositionCoordinate;
  /** The cell the target is placed in (what `partition` gives each child),
   *  on each axis its column is placed along. */
  region?: PositionRegion;
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
  region?: PositionRegion;
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
  { x, y, region, anchor, override }: PositionOptions,
  children: ConstraintRef[]
): PositionConstraint => {
  if (x === undefined && y === undefined && region === undefined) {
    throw new Error(
      "Constraint.position: at least one of `x`, `y`, or `region` must be " +
        "specified"
    );
  }
  (["x", "y"] as const).forEach((axis, i) => {
    const coord = axis === "x" ? x : y;
    if (isPositionInterval(coord)) validateInterval(axis, coord);
    if (coord !== undefined && region?.spans[i] !== undefined)
      throw new Error(
        `Constraint.position: \`${axis}\` and a \`region\` that spans ` +
          `${axis} both place the target on ${axis}; give one.`
      );
  });
  // `override` is a point-form no-op-escape: it repositions a self-placed
  // target. An interval or a region already places the target outright, so
  // the combination is meaningless — reject it rather than silently ignore.
  if (
    (override ?? false) &&
    (isPositionInterval(x) || isPositionInterval(y) || region !== undefined)
  ) {
    throw new Error(
      "Constraint.position: `override` applies to point coordinates only, " +
        "not interval `[min, max]` coordinates or a region"
    );
  }
  return {
    type: "position",
    x,
    y,
    ...(region !== undefined ? { region } : {}),
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
    keyOf,
    isInitiallyPlaced,
    isDataPositioned,
    resolveCoordinate,
  }: {
    emitter: PlacementFactEmitter;
    targets: Map<string, unknown>;
    keyOf: KeyOf;
    isInitiallyPlaced: (axis: Axis, key: string) => boolean;
    isDataPositioned: (axis: 0 | 1, key: string) => boolean;
    resolveCoordinate: (
      axis: Axis,
      coordinate: PositionValue
    ) => number | undefined;
  }
): void {
  // The operands this solve places, by key, read once.
  const keys = constraint.children.map(keyOf).filter((key) => targets.get(key));
  // A region centers its target in its cell on each axis the cell spans: the
  // target was laid out in the cell's length (`buildChildSpans`), so one with
  // no size of its own there fills the cell, and one with a size of its own
  // sits in its middle. A target with a position of its own there keeps it:
  // one placed by its data in the layer's frame (a `region` mark, or a layer
  // of marks with data positions) is already in its cell, and one that
  // placed itself is where it put itself.
  const center = (axis: Axis, span: PositionInterval | undefined) => {
    if (span === undefined) return;
    const a = resolveCoordinate(axis, span[0]);
    const b = resolveCoordinate(axis, span[1]);
    if (a === undefined || b === undefined) return;
    const index = axis === "x" ? 0 : 1;
    for (const key of keys) {
      if (isInitiallyPlaced(axis, key)) continue;
      if (isDataPositioned(index, key)) continue;
      emitter.pin({
        axis,
        target: { key, anchor: "middle" },
        value: (a + b) / 2,
        owner,
      });
    }
  };
  center("x", constraint.region?.spans[0]);
  center("y", constraint.region?.spans[1]);
  const emit = (axis: Axis, coordinate: PositionCoordinate | undefined) => {
    if (coordinate === undefined) return;
    // Interval form: pin BOTH edges (start=min, end=max) as strong anchor pins.
    // Two edges are rank 2, so cell closure determines the size — the extent
    // that a size-setting range needs, which a single point pin cannot express.
    // Not gated by `isInitiallyPlaced`: an interval authoritatively sets the
    // target's extent (as `setExtent` does), overriding a self-placed layout.
    if (isPositionInterval(coordinate)) {
      const min = resolveCoordinate(axis, coordinate[0]);
      const max = resolveCoordinate(axis, coordinate[1]);
      if (min === undefined || max === undefined) return;
      for (const key of keys) {
        emitter.pin({
          axis,
          target: { key, anchor: "start" },
          value: min,
          owner,
        });
        emitter.pin({
          axis,
          target: { key, anchor: "end" },
          value: max,
          owner,
        });
      }
      return;
    }
    const value = resolveCoordinate(axis, coordinate);
    if (value === undefined) return;
    for (const key of keys) {
      if (isInitiallyPlaced(axis, key) && !constraint.override) continue;
      emitter.pin({
        axis,
        target: { key, anchor: constraint.anchor },
        value,
        owner,
      });
    }
  };
  emit("x", constraint.x);
  emit("y", constraint.y);
}
