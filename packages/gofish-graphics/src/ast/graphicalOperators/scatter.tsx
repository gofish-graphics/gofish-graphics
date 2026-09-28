import { GoFishNode } from "../_node";
import type { AxisOptions } from "../gofish";
import { MaybeValue, type PositionValue } from "../data";
import {
  FancyDims,
  type Direction,
  mergeAxisDims,
  type AxisDims,
  type AxisDimsForm,
  type AxisScope,
  type Interval,
} from "../dims";
import { createNodeOperator } from "../withGoFish";
import { GoFishAST } from "../_ast";
import { Collection } from "lodash";
import { SplitBy, splitEntries, scatterPositions } from "../datumProjection";
import { Alignment } from "./alignment";
import { createOperator } from "../marks/createOperator";
import { layer } from "./layer";
import { Constraint, type ConstraintSpec } from "../constraints";
import { axisName, ensureChildNames } from "../constraints/shared";

const unwrapLodashArray = function <T>(value: T[] | Collection<T>): T[] {
  if (typeof value === "object" && value !== null && "value" in value) {
    return (value as Collection<T>).value() as T[];
  }
  return value as T[];
};

export type ScatterProps = {
  key?: string;
  x?: PositionValue[];
  y?: PositionValue[];
  /** Range form: position each child so it spans [xMin[i], xMax[i]] in data space. */
  xMin?: MaybeValue<number>[];
  xMax?: MaybeValue<number>[];
  yMin?: MaybeValue<number>[];
  yMax?: MaybeValue<number>[];
  /** Per-child placement by axis name; see {@link ScatterOptions}. */
  dims?: AxisDims<PositionValue[]>;
  alignment?: Alignment;
  axes?: boolean | { x?: AxisOptions; y?: AxisOptions };
} & Omit<FancyDims<MaybeValue<number>>, "dims">;

/** One axis of a scatter's placement: a point per child (`center`), or a
 *  span (`min`, `max`). */
type AxisPlacement = Interval<any[]>;

/** How a scatter reads `dims`: a bare value is the point, like `x`, and a
 *  scatter sizes nothing, so `size` is not a key. */
const SCATTER_DIMS: AxisDimsForm = {
  where: "scatter dims",
  bare: "center",
  topLevel: {
    center: ["x", "y"],
    min: ["xMin", "yMin"],
    max: ["xMax", "yMax"],
  },
  badKey:
    "It is not a scatter placement. A scatter puts each child at a point " +
    "(a bare value or { center }) or across a span ({ min, max }); size the " +
    "child mark instead.",
};

/**
 * Merge a scatter's top-level x/y/xMin/... with its axis-name-keyed `dims`
 * into one placement per axis, resolving the names against `scope`. Each slot
 * may be set once, and every array must have one entry per child.
 */
function scatterAxes(
  xy: Pick<ScatterProps, "x" | "y" | "xMin" | "xMax" | "yMin" | "yMax">,
  dims: AxisDims<PositionValue[]> | undefined,
  scope: AxisScope,
  count: number
): AxisPlacement[] {
  const axes: AxisPlacement[] = [
    { center: xy.x, min: xy.xMin, max: xy.xMax },
    { center: xy.y, min: xy.yMin, max: xy.yMax },
  ];
  const origin = mergeAxisDims(axes, dims ?? {}, scope, SCATTER_DIMS);
  for (const axis of [0, 1] as const) {
    // Checked on the merged axis, so the two ends may come from different
    // spellings (`xMin` with `dims.x.max`).
    const { min, max } = axes[axis];
    if ((min === undefined) !== (max === undefined)) {
      const [set, unset] = min !== undefined ? ["min", "max"] : ["max", "min"];
      throw new Error(
        `${origin(set as "min" | "max", axis)} sets one end of a scatter ` +
          `span on axis ${axis}, but nothing sets its ${unset}. A span ` +
          `needs both ends.`
      );
    }
  }
  for (const axis of [0, 1] as const) {
    for (const key of ["center", "min", "max"] as const) {
      const arr = axes[axis][key];
      if (arr !== undefined && arr.length !== count) {
        throw new Error(
          `Scatter operator ${origin(key, axis)} array must match ` +
            `children length`
        );
      }
    }
  }
  if (!axes.some((_, axis) => isPlaced(axes, axis as Direction))) {
    throw new Error("Scatter operator requires at least one of x or y");
  }
  return axes;
}

/** Does this axis place the children (a point, or a full span)? The same
 *  test as the operator's `arrangement` (`scatterPositions`). */
const isPlaced = (axes: AxisPlacement[], axis: Direction): boolean => {
  const [x, y] = axes;
  const placed = scatterPositions({
    x: x.center,
    xMin: x.min,
    xMax: x.max,
    y: y.center,
    yMin: y.min,
    yMax: y.max,
  });
  return axis === 0 ? placed.x : placed.y;
};

const Scatter = createNodeOperator(
  async (
    options: ScatterProps,
    children: GoFishAST[] | Collection<GoFishAST>
  ) => {
    const {
      key,
      x,
      y,
      xMin,
      xMax,
      yMin,
      yMax,
      dims,
      alignment = "baseline",
      axes,
      ...fancyDims
    } = options;
    children = unwrapLodashArray(children);

    if (children.length === 0) {
      throw new Error("Scatter operator expects at least one child");
    }

    // Elaborate to a layer carrying per-child placement constraints (#546),
    // sharing the constraint path instead of a bespoke layout (as spread
    // delegates to distribute/align):
    //   - plain x / y      → point Constraint.position (centers the child on its
    //                        datum; `override` repositions a child that
    //                        self-placed in its own layout, e.g. a Frame / coord
    //                        glyph).
    //   - range xMin/xMax  → interval Constraint.position ({ x: [min, max] }):
    //                        two edges DETERMINE the size via the linsys bbox
    //                        (#39) — the size-setting the bespoke layout used to
    //                        do by hand on intrinsicDims.
    //   - an axis with neither → a plain cross-axis align (data-positioned
    //                        children are already placed by their position
    //                        constraints, so the align walk skips them).
    // The layer derives the data→pixel posScale from the position datum coords
    // (point values plus interval endpoints — collectPositionDomains).
    const childList = children as GoFishAST[];
    const names = ensureChildNames(childList, "scatter");
    const node = (await layer(
      { key, ...fancyDims } as any,
      childList
    )) as GoFishNode;
    // `dims` names its axes the way the enclosing coordinate space does
    // (`theta`, `lon`, ...), so the per-axis placement, and the constraints
    // built from it, wait for the resolveAliases pass.
    node._elaborateInAxisScope = async (_outer, inner) => {
      const placement = scatterAxes(
        { x, y, xMin, xMax, yMin, yMax },
        dims,
        inner,
        childList.length
      );
      await node.relate((g) => {
        const refs = names.map((name) => g[name]);
        const cs: ConstraintSpec[] = [];
        childList.forEach((_, i) => {
          const pos: {
            x?: PositionValue;
            y?: PositionValue;
            override: boolean;
          } = { override: true };
          const span: {
            x?: [MaybeValue<number>, MaybeValue<number>];
            y?: [MaybeValue<number>, MaybeValue<number>];
          } = {};
          ([0, 1] as const).forEach((axis) => {
            const name = axisName(axis);
            const { center: point, min, max } = placement[axis];
            if (point?.[i] !== undefined) pos[name] = point[i];
            if (min?.[i] !== undefined && max?.[i] !== undefined)
              span[name] = [min[i], max[i]];
          });
          if (pos.x !== undefined || pos.y !== undefined)
            cs.push(Constraint.position(pos, [refs[i]]));
          if (span.x !== undefined || span.y !== undefined)
            cs.push(Constraint.position(span, [refs[i]]));
        });
        // A cross-axis align over the (data-positioned) points: it shares the
        // frame; `align` leaves the points where their own scale puts them by
        // reading their abstract placement (no guard flag needed).
        ([0, 1] as const).forEach((axis) => {
          if (!isPlaced(placement, axis))
            cs.push(Constraint.align({ [axisName(axis)]: alignment }, refs));
        });
        return cs;
      });
    };
    if (axes !== undefined) {
      const toShow = (opt: AxisOptions | undefined): boolean | undefined =>
        opt === undefined ? undefined : opt === false ? false : true;
      node._axisOverride =
        typeof axes === "boolean"
          ? { x: axes, y: axes }
          : { x: toShow(axes.x), y: toShow(axes.y) };
    }
    return node;
  }
);

/**
 * Scatter options. Each position field (`x`/`y`/`xMin`/etc.) accepts either:
 *   - a field-name accessor string (operator form; inferred per entry)
 *   - a pre-built positions array (combinator form; used as-is)
 *   - a scalar (applied to all children)
 * Per-entry channel inference handles the polymorphism.
 *
 * `dims` places children by axis NAME, the way the enclosing coordinate space
 * names its axes (`{ theta: "bearing", r: "distance" }` in polar,
 * `{ lon: "lon", lat: "lat" }` in geo; `x`/`y` always work). A bare value is
 * the point position, like `x`; `{ min, max }` is the span, like
 * `xMin`/`xMax`; `{ center }` is the point again.
 *
 * `by` is a groupBy field — omit for per-item scatter.
 */
export type ScatterOptions = {
  by?: SplitBy;
  x?: string | number | PositionValue[];
  y?: string | number | PositionValue[];
  dims?: AxisDims<string | number | PositionValue[]>;
  xMin?: string | MaybeValue<number>[];
  xMax?: string | MaybeValue<number>[];
  yMin?: string | MaybeValue<number>[];
  yMax?: string | MaybeValue<number>[];
  alignment?: "start" | "middle" | "end" | "baseline";
  debug?: boolean;
  axes?: boolean | { x?: AxisOptions; y?: AxisOptions };
  w?: MaybeValue<number>;
  h?: MaybeValue<number>;
};

export const scatter = createOperator<any, ScatterOptions>(Scatter as any, {
  // When no `by` is given, pass each item through as-is. Items may already be
  // arrays or scalars; downstream marks/channels handle either form.
  split: ({ by }, d) =>
    by ? splitEntries(by, d) : new Map(d.map((r, i) => [i, r])),
  channels: {
    x: { type: "pos", entry: true, discrete: true },
    y: { type: "pos", entry: true, discrete: true },
    xMin: { type: "pos", entry: true },
    xMax: { type: "pos", entry: true },
    yMin: { type: "pos", entry: true },
    yMax: { type: "pos", entry: true },
    // Each `dims` slot infers exactly as its top-level counterpart above.
    dims: { type: "dims", form: SCATTER_DIMS },
  },
  axisFields: ({ x, y, xMin, xMax, yMin, yMax }) => {
    const fields: { x?: string; y?: string } = {};
    if (typeof x === "string") fields.x = x;
    else if (typeof xMin === "string") fields.x = xMin;
    else if (typeof xMax === "string") fields.x = xMax;
    if (typeof y === "string") fields.y = y;
    else if (typeof yMin === "string") fields.y = yMin;
    else if (typeof yMax === "string") fields.y = yMax;
    return fields;
  },
  // `x`/`y` are literal per-item coordinates — a continuous value channel.
  // `dims` is read only once the enclosing coordinate space is known, so the
  // travel-axis rule, which runs at build time, does not see it.
  // TODO(#838 follow-up): resolve the travel axis by name too.
  arrangement: { kind: "value", positions: scatterPositions },
  serialize: { type: "scatter" },
});
