import { axisOverrideOf, GoFishNode } from "../_node";
import type { AxisOptions } from "../gofish";
import {
  DatumValueImpl,
  MaybeValue,
  getQuantity,
  getValue,
  getValueField,
  getValueFieldType,
  getValueOffset,
  isDiscretePosition,
  isValue,
  type PositionValue,
} from "../data";
import {
  type Direction,
  MARK_DIMS,
  mapAxisDims,
  mergeAxisDims,
  type AxisDims,
  type AxisDimsForm,
  type AxisScope,
  type Interval,
  type XYWHDims,
} from "../dims";
import { createNodeOperator } from "../withGoFish";
import { GoFishAST } from "../_ast";
import { Collection } from "lodash";
import { SplitBy, splitEntries } from "../datumProjection";
import { Alignment } from "./alignment";
import { createOperator } from "../marks/createOperator";
import { layer } from "./layer";
import { Constraint, type ConstraintSpec } from "../constraints";
import type { PositionInterval } from "../constraints/position";
import { axisName, childSlots } from "../constraints/shared";
import { createOverlapConstraint } from "../constraints/overlap";
import type { Overlap } from "../../families/overlap";

const unwrapLodashArray = function <T>(value: T[] | Collection<T>): T[] {
  if (typeof value === "object" && value !== null && "value" in value) {
    return (value as Collection<T>).value() as T[];
  }
  return value as T[];
};

export type ScatterProps = {
  key?: string;
  /** Where each child's start (min) edge goes. */
  x?: PositionValue[];
  y?: PositionValue[];
  /** Where each child's center goes. */
  cx?: PositionValue[];
  cy?: PositionValue[];
  /** Where each child's end (max) edge goes. With `x`, the child spans
   *  [x[i], x2[i]] in data space. */
  x2?: PositionValue[];
  y2?: PositionValue[];
  /** Per-child placement by axis name; see {@link ScatterOptions}. */
  dims?: AxisDims<PositionValue[]>;
  alignment?: Alignment;
  /** How children on a free axis keep clear of each other; see
   *  {@link ScatterOptions.overlap}. */
  overlap?: Overlap;
  axes?: boolean | { x?: AxisOptions; y?: AxisOptions };
} & Omit<XYWHDims<MaybeValue<number>>, PlacementKey | "dims">;

/** One axis of a scatter's placement, per child: where its start edge
 *  (`min`), its center (`center`) and its end edge (`max`) go. */
type AxisPlacement = Interval<any[]>;

/** How a scatter reads its placement options: the marks' table
 *  ({@link MARK_DIMS}), so `x` is the start edge, `cx` the center, `x2` the
 *  end edge, and a bare `dims` value the start, as for a mark. A scatter
 *  places its children and sizes none of them, so the table's `size` and
 *  `embedded` slots, which a mark reads as its own size, are not keys. */
const SCATTER_DIMS: AxisDimsForm = {
  where: "scatter dims",
  bare: MARK_DIMS.bare,
  topLevel: {
    min: MARK_DIMS.topLevel.min,
    center: MARK_DIMS.topLevel.center,
    max: MARK_DIMS.topLevel.max,
  },
  badKey:
    "It is not a scatter placement. A scatter puts an anchor of each child " +
    "on its value: its start ({ min }, or a bare value), its center " +
    "({ center }) or its end ({ max }); size the child mark instead.",
};

/** The top-level options that place a scatter's children, per axis: its
 *  start, center and end. */
const PLACEMENT_KEYS = [
  ["x", ["x", "cx", "x2"]],
  ["y", ["y", "cy", "y2"]],
] as const;
type PlacementKey = (typeof PLACEMENT_KEYS)[number][1][number];

/** A scatter's top-level placement options. */
type ScatterXY = Pick<ScatterProps, PlacementKey>;

/** The anchor of a child each slot of an {@link AxisPlacement} places. */
const SLOT_ANCHOR = { min: "start", center: "middle", max: "end" } as const;
type PlacementSlot = keyof typeof SLOT_ANCHOR;
const SLOTS = Object.keys(SLOT_ANCHOR) as PlacementSlot[];

/** The placement per axis that a scatter's top-level keys give, before
 *  `dims` is merged in. */
const topLevelAxes = <T,>(
  xy: Partial<Record<PlacementKey, T>>
): Interval<T>[] => [
  { min: xy.x, center: xy.cx, max: xy.x2 },
  { min: xy.y, center: xy.cy, max: xy.y2 },
];

/** Does this axis place the children (by any of its anchors)? */
const isPlaced = (axis: Interval<unknown>): boolean =>
  SLOTS.some((key) => axis[key] !== undefined);

/**
 * The anchor across `center` from `edge`: `2 · center − edge`, the other
 * edge of a child whose center is `center` and one edge `edge`. The sum is
 * taken in data space, so it is the true other edge only on a linear scale.
 * Two pixel literals give a pixel literal and two data values a data value
 * (its pixel offsets combine the same way). A pixel literal and a data value
 * have no such sum, since one is before the scale and the other after it.
 */
function mirror(
  center: PositionValue,
  edge: PositionValue,
  keys: () => string
): PositionValue {
  if (typeof center === "number" && typeof edge === "number")
    return 2 * center - edge;
  const c = center as MaybeValue<number>;
  const e = edge as MaybeValue<number>;
  if (
    isValue(c) &&
    isValue(e) &&
    typeof getValue(c) === "number" &&
    typeof getValue(e) === "number"
  )
    return new DatumValueImpl(
      2 * getValue(c) - getValue(e),
      getQuantity(c),
      2 * getValueOffset(c) - getValueOffset(e) || undefined,
      undefined,
      getValueField(c),
      getValueFieldType(c)
    );
  throw new Error(
    `scatter: ${keys()} place a child's center and one edge, so its other ` +
      `edge is computed from them, but one is a pixel literal and the other ` +
      `a data value. Give both as data values or both as pixels.`
  );
}

/**
 * Merge a scatter's top-level x/cx/x2 and y/cy/y2 with its axis-name-keyed
 * `dims` into one placement per axis, resolving the names against `scope`.
 * Each slot may be set once, an axis may set at most two of its three
 * anchors (a child has a position and a size on an axis, and two anchors
 * fix both), and every array must have one entry per child.
 *
 * Two anchors on an axis determine an interval, so an axis given its center
 * and one edge comes back as its two edges ({@link mirror}): every
 * two-anchor axis is a span, `{ min, max }`, and every other axis has one
 * anchor or none.
 */
function scatterAxes(
  xy: ScatterXY,
  dims: AxisDims<PositionValue[]> | undefined,
  scope: AxisScope,
  count: number
): AxisPlacement[] {
  const axes: AxisPlacement[] = topLevelAxes(xy);
  const origin = mergeAxisDims(axes, dims ?? {}, scope, SCATTER_DIMS);
  // The axis's name as the user wrote it: the `dims` name if one placed
  // this axis, else x or y.
  const nameOf = (axis: Direction) =>
    Object.keys(dims ?? {}).find((n) => scope.names[n] === axis) ??
    axisName(axis);
  for (const axis of [0, 1] as const) {
    const set = SLOTS.filter((key) => axes[axis][key] !== undefined);
    const keys = () => set.map((key) => origin(key, axis)).join(", ");
    if (set.length === 3)
      throw new Error(
        `scatter: ${keys()} all place the children on ${nameOf(axis)}, but ` +
          `two anchors already fix a child's position and size there. Give ` +
          `at most two of them.`
      );
    for (const key of set)
      if (axes[axis][key]!.length !== count)
        throw new Error(
          `Scatter operator ${origin(key, axis)} array must match ` +
            `children length`
        );
    if (set.length < 2) continue;
    // Two anchors make a span, and a span runs between two values.
    const discrete = set.find((key) =>
      axes[axis][key]!.some(isDiscretePosition)
    );
    if (discrete !== undefined)
      throw new Error(
        `scatter: ${keys()} make a span on ${nameOf(axis)}, but ` +
          `${origin(discrete, axis)} names a categorical field, which gives ` +
          `each child a slot, not a value. A span's ends must be numeric or ` +
          `time values.`
      );
    const { min, center, max } = axes[axis];
    if (center !== undefined)
      axes[axis] =
        max !== undefined
          ? { min: max.map((b, i) => mirror(center[i], b, keys)), max }
          : { min, max: min!.map((a, i) => mirror(center[i], a, keys)) };
  }
  if (!axes.some(isPlaced)) {
    throw new Error("Scatter operator requires at least one of x or y");
  }
  return axes;
}

/**
 * An overlap strategy keeps children clear of each other in the layout frame.
 * That frame is the screen only in a linear space: under polar or any other
 * warping space, layout happens in the data plane, and circles that do not
 * overlap there can overlap once warped (or the reverse). So refuse it there.
 * The axis scope carries the nearest such space (`warpedBy`).
 *
 * TODO(#1002): separate dots in screen space under a non-linear coordinate transform.
 */
function assertLinearSpace(scope: AxisScope): void {
  if (scope.warpedBy !== undefined)
    throw new Error(
      `scatter: \`overlap\` works only in a linear coordinate space, but ` +
        `this scatter is inside a "${scope.warpedBy}" space. It keeps children ` +
        `clear of each other in the layout frame, which a non-linear space ` +
        `warps (#1002).`
    );
}

/**
 * The children a scatter places, and their placements. A child is placed at
 * its values, so a child with no value in a placement it is given has no
 * place, and the scatter does not draw it: the position of a group with no
 * rows is the mean of nothing, which has no value (`meanOf`, fieldExpr.ts).
 * It is the mark factory's rule, no value means not drawn
 * (`buildCreatedMark` in withGoFish.ts), with one difference the domain
 * forces: a mark whose own channel has no value keeps its place in the
 * layout, but a child whose placement has no value has no place to keep, so
 * the scatter leaves it out of the layout too.
 * An array that does not have one entry per child is kept whole, for
 * {@link scatterAxes} to report.
 */
function placedChildren(
  children: GoFishAST[],
  xy: ScatterXY,
  dims: AxisDims<PositionValue[]> | undefined
): {
  children: GoFishAST[];
  xy: ScatterXY;
  dims: AxisDims<PositionValue[]> | undefined;
} {
  const count = children.length;
  const perChild = (a: unknown): a is unknown[] =>
    Array.isArray(a) && a.length === count;
  const given: unknown[][] = Object.values(xy).filter(perChild);
  if (dims !== undefined)
    mapAxisDims(dims, (a) => (perChild(a) ? given.push(a) : 0), SCATTER_DIMS);
  const kept = children.flatMap((_, i) =>
    given.every((a) => a[i] !== undefined) ? [i] : []
  );
  if (kept.length === count) return { children, xy, dims };
  const pick = <A,>(a: A): A =>
    perChild(a) ? (kept.map((i) => a[i]) as A) : a;
  return {
    children: kept.map((i) => children[i]),
    xy: Object.fromEntries(
      Object.entries(xy).map(([k, a]) => [k, pick(a)])
    ) as typeof xy,
    dims:
      dims === undefined ? undefined : mapAxisDims(dims, pick, SCATTER_DIMS),
  };
}

const Scatter = createNodeOperator(
  async (
    options: ScatterProps,
    children: GoFishAST[] | Collection<GoFishAST>
  ) => {
    const {
      key,
      x,
      cx,
      x2,
      y,
      cy,
      y2,
      dims,
      alignment = "baseline",
      overlap,
      axes,
      ...fancyDims
    } = options;
    children = unwrapLodashArray(children);

    // Elaborate to a layer carrying per-child placement constraints (#546),
    // sharing the constraint path instead of a bespoke layout (as spread
    // delegates to distribute/align):
    //   - x, cx or x2      → point Constraint.position with the anchor the key
    //                        names (start, middle, end); `override` repositions
    //                        a child that self-placed in its own layout, e.g. a
    //                        layer / coord glyph.
    //   - two of them      → interval Constraint.position ({ x: [min, max] }):
    //                        two edges DETERMINE the size via the linsys bbox
    //                        (#39), and the layer lays the child out in the
    //                        span's length. A center with one edge comes in
    //                        as its two edges (scatterAxes).
    //   - an axis with none → a plain cross-axis align (data-positioned
    //                        children are already placed by their position
    //                        constraints, so the align walk skips them).
    // The layer derives the data→pixel posScale from the position datum coords
    // (point values plus interval endpoints — collectPositionDomains).
    const placed = placedChildren(
      children as GoFishAST[],
      { x, cx, x2, y, cy, y2 },
      dims
    );
    const childList = placed.children;
    const node = (await layer(
      { key, ...fancyDims } as any,
      childList
    )) as GoFishNode;
    // `dims` names its axes the way the enclosing coordinate space does
    // (`theta`, `lon`, ...), so the per-axis placement, and the constraints
    // built from it, wait for the resolveAliases pass.
    node._elaborateInAxisScope = async (_outer, inner) => {
      if (overlap !== undefined) assertLinearSpace(inner);
      const placement = scatterAxes(
        placed.xy,
        placed.dims,
        inner,
        childList.length
      );
      const refs = childSlots(node);
      const cs: ConstraintSpec[] = [];
      // Which axes each constraint places is the same for every child, so
      // group them once: the span axes (two anchors, now both edges) into
      // one span constraint, and the one-anchor axes into one point
      // constraint per anchor.
      const spanAxes = ([0, 1] as const).filter(
        (axis) =>
          placement[axis].min !== undefined && placement[axis].max !== undefined
      );
      const pointsBySlot = SLOTS.map(
        (slot) =>
          [
            slot,
            ([0, 1] as const).filter(
              (axis) =>
                !spanAxes.includes(axis) && placement[axis][slot] !== undefined
            ),
          ] as const
      ).filter(([, axes]) => axes.length > 0);
      const coords = <V,>(
        axes: readonly Direction[],
        value: (axis: Direction) => V
      ) => Object.fromEntries(axes.map((a) => [axisName(a), value(a)]));
      childList.forEach((_, i) => {
        for (const [slot, axes] of pointsBySlot)
          cs.push(
            Constraint.position(
              {
                ...coords(axes, (a) => placement[a][slot]![i]),
                anchor: SLOT_ANCHOR[slot],
                override: true,
              },
              [refs[i]]
            )
          );
        if (spanAxes.length > 0)
          cs.push(
            Constraint.position(
              coords(
                spanAxes,
                (a): PositionInterval => [
                  placement[a].min![i],
                  placement[a].max![i],
                ]
              ),
              [refs[i]]
            )
          );
      });
      // A cross-axis align over the (data-positioned) points: it shares the
      // frame; `align` leaves the points where their own scale puts them by
      // reading their abstract placement (no guard flag needed). An overlap
      // strategy takes the align's place: it grows the children away from
      // the same line, keeping them clear of each other.
      const freeAxes = ([0, 1] as const).filter(
        (axis) => !isPlaced(placement[axis])
      );
      if (overlap !== undefined && freeAxes.length === 0)
        throw new Error(
          "scatter: `overlap` moves children along an axis no field " +
            "places, but both x and y are placed by fields here. Drop one " +
            "of them, or drop `overlap`."
        );
      for (const axis of freeAxes)
        cs.push(
          overlap !== undefined
            ? createOverlapConstraint(axisName(axis), alignment, overlap, refs)
            : Constraint.align({ [axisName(axis)]: alignment }, refs)
        );
      await node.INTERNAL_relate(cs);
    };
    if (axes !== undefined) node._axisOverride = axisOverrideOf(axes);
    return node;
  }
);

/**
 * Scatter options. Each position field (`x`/`cx`/`x2`, `y`/`cy`/`y2`)
 * accepts either:
 *   - a field-name accessor string (operator form; inferred per entry)
 *   - a pre-built positions array (combinator form; used as-is)
 *   - a scalar (applied to all children)
 * Per-entry channel inference handles the polymorphism.
 *
 * `dims` places children by axis NAME, the way the enclosing coordinate space
 * names its axes (`{ theta: { center: "bearing" }, r: { center: "distance" } }`
 * in polar, `{ lon: { center: "lon" }, lat: { center: "lat" } }` in geo;
 * `x`/`y` always work). It reads as a mark's `dims` does: a bare value or
 * `{ min }` is the start, like `x`; `{ center }` is the center, like `cx`;
 * `{ max }` is the end, like `x2`.
 *
 * The keys mean what they mean on a mark: `x` is where each child's start
 * (min) edge goes, `cx` its center, `x2` its end (max) edge. Two of them on
 * one axis make a span, which fixes the child's size there: `x` with `x2`
 * directly, and the center with one edge through the other edge, `2 · cx −
 * x2` (exact on a linear scale).
 *
 * `by` is a groupBy field — omit for per-item scatter.
 */
export type ScatterOptions = {
  by?: SplitBy;
  /** Where each child's start (min) edge goes. */
  x?: string | number | PositionValue[];
  y?: string | number | PositionValue[];
  /** Where each child's center goes. */
  cx?: string | number | PositionValue[];
  cy?: string | number | PositionValue[];
  /** Where each child's end (max) edge goes. */
  x2?: string | number | PositionValue[];
  y2?: string | number | PositionValue[];
  dims?: AxisDims<string | number | PositionValue[]>;
  alignment?: "start" | "middle" | "end" | "baseline";
  /**
   * How children keep clear of each other on the free axis (the axis no field
   * places), made by a function call: `separate({ padding })` is a beeswarm,
   * `noise({ randomness, smoothing })` spreads dots inside a density outline,
   * `sina()` is noise with a violin outline, and `jitter()` is noise in a
   * flat band.
   * The strategy takes the place of the align on that axis and grows from the
   * `alignment` line: `"middle"` both ways, `"start"`/`"baseline"` to
   * the positive side, `"end"` to the negative side. Omit it, and every
   * child sits on the line. Only in a linear coordinate space.
   */
  overlap?: Overlap;
  debug?: boolean;
  axes?: boolean | { x?: AxisOptions; y?: AxisOptions };
  w?: MaybeValue<number>;
  h?: MaybeValue<number>;
};

export const scatter = createOperator<any, ScatterOptions>(Scatter as any, {
  split: ({ by }, d) => splitEntries(by, d),
  // The three anchors of an axis are one kind of channel: a numeric field
  // gives values, and a non-numeric one discrete positions.
  channels: {
    x: { type: "pos", entry: true, discrete: true },
    cx: { type: "pos", entry: true, discrete: true },
    x2: { type: "pos", entry: true, discrete: true },
    y: { type: "pos", entry: true, discrete: true },
    cy: { type: "pos", entry: true, discrete: true },
    y2: { type: "pos", entry: true, discrete: true },
    // Each `dims` slot infers exactly as its top-level counterpart above.
    dims: { type: "dims", form: SCATTER_DIMS },
  },
  // An axis is titled by the first of its anchors, start, center, end, that
  // names a field.
  axisFields: (opts) => {
    const fields: { x?: string; y?: string } = {};
    for (const [axis, keys] of PLACEMENT_KEYS) {
      const named = keys.map((k) => opts[k]).find((v) => typeof v === "string");
      if (named !== undefined) fields[axis] = named as string;
    }
    return fields;
  },
  // The placement keys are literal per-item coordinates — a continuous
  // value channel. `dims` is read only once the enclosing coordinate space
  // is known, so the travel-axis rule, which runs at build time, does not
  // see it.
  // TODO(#838 follow-up): resolve the travel axis by name too.
  arrangement: {
    kind: "value",
    positions: (opts) => {
      const [x, y] = topLevelAxes(opts);
      return { x: isPlaced(x), y: isPlaced(y) };
    },
  },
  serialize: "scatter",
});
