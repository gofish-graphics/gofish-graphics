import { GoFishNode } from "../_node";
import type { AxisOptions } from "../gofish";
import { MaybeValue, type PositionValue } from "../data";
import { FancyDims } from "../dims";
import { createNodeOperator } from "../withGoFish";
import { GoFishAST } from "../_ast";
import { Collection } from "lodash";
import { SplitBy, splitKeyFn } from "../datumProjection";
import { Alignment } from "./alignment";
import { createOperator } from "../marks/createOperator";
import { layer } from "./layer";
import { Constraint, type ConstraintSpec } from "../constraints";
import { ensureChildNames } from "../constraints/shared";

const unwrapLodashArray = function <T>(value: T[] | Collection<T>): T[] {
  if (typeof value === "object" && value !== null && "value" in value) {
    return (value as Collection<T>).value() as T[];
  }
  return value as T[];
};

export type ScatterProps = {
  name?: string;
  key?: string;
  x?: PositionValue[];
  y?: PositionValue[];
  /** Range form: position each child so it spans [xMin[i], xMax[i]] in data space. */
  xMin?: MaybeValue<number>[];
  xMax?: MaybeValue<number>[];
  yMin?: MaybeValue<number>[];
  yMax?: MaybeValue<number>[];
  alignment?: Alignment;
  axes?: boolean | { x?: AxisOptions; y?: AxisOptions };
} & FancyDims<MaybeValue<number>>;

export const Scatter = createNodeOperator(
  async (
    options: ScatterProps,
    children: GoFishAST[] | Collection<GoFishAST>
  ) => {
    const {
      name,
      key,
      x,
      y,
      xMin,
      xMax,
      yMin,
      yMax,
      alignment = "baseline",
      axes,
      ...fancyDims
    } = options;
    children = unwrapLodashArray(children);

    const hasX = x !== undefined || (xMin !== undefined && xMax !== undefined);
    const hasY = y !== undefined || (yMin !== undefined && yMax !== undefined);

    if (children.length === 0) {
      throw new Error("Scatter operator expects at least one child");
    }
    if (!hasX && !hasY) {
      throw new Error("Scatter operator requires at least one of x or y");
    }
    if (x !== undefined && x.length !== children.length) {
      throw new Error("Scatter operator x array must match children length");
    }
    if (y !== undefined && y.length !== children.length) {
      throw new Error("Scatter operator y array must match children length");
    }
    if (xMin !== undefined && xMin.length !== children.length) {
      throw new Error("Scatter operator xMin array must match children length");
    }
    if (xMax !== undefined && xMax.length !== children.length) {
      throw new Error("Scatter operator xMax array must match children length");
    }
    if (yMin !== undefined && yMin.length !== children.length) {
      throw new Error("Scatter operator yMin array must match children length");
    }
    if (yMax !== undefined && yMax.length !== children.length) {
      throw new Error("Scatter operator yMax array must match children length");
    }

    // Elaborate to a layer carrying per-child placement constraints (#546),
    // sharing the constraint path instead of a bespoke layout (as spread
    // delegates to distribute/align):
    //   - plain x / y      → Constraint.position (centers the child on its datum;
    //                        `override` repositions a child that self-placed in
    //                        its own layout, e.g. a Frame / coord glyph).
    //   - range xMin/xMax  → Constraint.span: two edges DETERMINE the size via
    //                        the linsys bbox (#39) — the size-setting the bespoke
    //                        layout used to do by hand on intrinsicDims.
    //   - an axis with neither → a plain cross-axis align (data-positioned
    //                        children are already placed by their span/position
    //                        constraints, so the align walk skips them).
    // The layer derives the data→pixel posScale from the position/span datum
    // coords (collectPositionDomains).
    const childList = children as GoFishAST[];
    const names = ensureChildNames(childList, "scatter");
    const node = (await layer(
      { key, ...fancyDims } as any,
      childList
    )) as GoFishNode;
    node.constrain((ref) => {
      const refs = names.map((n) => ref[n] ?? { name: n });
      const cs: ConstraintSpec[] = [];
      childList.forEach((_, i) => {
        const pos: {
          x?: PositionValue;
          y?: PositionValue;
          override: boolean;
        } = { override: true };
        if (x?.[i] !== undefined) pos.x = x[i];
        if (y?.[i] !== undefined) pos.y = y[i];
        if (pos.x !== undefined || pos.y !== undefined)
          cs.push(Constraint.position(pos, [refs[i]]));

        const span: {
          x?: [MaybeValue<number>, MaybeValue<number>];
          y?: [MaybeValue<number>, MaybeValue<number>];
        } = {};
        if (xMin?.[i] !== undefined && xMax?.[i] !== undefined)
          span.x = [xMin[i], xMax[i]];
        if (yMin?.[i] !== undefined && yMax?.[i] !== undefined)
          span.y = [yMin[i], yMax[i]];
        if (span.x !== undefined || span.y !== undefined)
          cs.push(Constraint.span(span, [refs[i]]));
      });
      // A cross-axis align over the (data-positioned) points: it shares the
      // frame; `align` leaves the points where their own scale puts them by
      // reading their abstract placement (no guard flag needed).
      if (!hasX) cs.push(Constraint.align({ x: alignment }, refs));
      if (!hasY) cs.push(Constraint.align({ y: alignment }, refs));
      return cs;
    });
    if (name !== undefined) node._name = name;
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
 * `by` is a groupBy field — omit for per-item scatter.
 */
export type ScatterOptions = {
  by?: SplitBy;
  x?: string | number | PositionValue[];
  y?: string | number | PositionValue[];
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
    by ? Map.groupBy(d, splitKeyFn(by)) : new Map(d.map((r, i) => [i, r])),
  channels: {
    x: { type: "pos", entry: true, discrete: true },
    y: { type: "pos", entry: true, discrete: true },
    xMin: { type: "pos", entry: true },
    xMax: { type: "pos", entry: true },
    yMin: { type: "pos", entry: true },
    yMax: { type: "pos", entry: true },
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
  serialize: { type: "scatter" },
});
