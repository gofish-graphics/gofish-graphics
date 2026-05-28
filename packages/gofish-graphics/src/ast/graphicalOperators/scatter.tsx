import { GoFishNode, Placeable } from "../_node";
import { getValue, isValue, MaybeValue } from "../data";
import { Dimensions, elaborateDims, FancyDims, Size } from "../dims";
import { createNodeOperator } from "../withGoFish";
import { GoFishAST } from "../_ast";
import { Collection } from "lodash";
import { POSITION, UNDEFINED, UnderlyingSpace } from "../underlyingSpace";
import * as Interval from "../../util/interval";
import { Alignment, alignChildren, resolveAlignmentSpace } from "./alignment";
import { createOperator } from "../marks/createOperator";

const unwrapLodashArray = function <T>(value: T[] | Collection<T>): T[] {
  if (typeof value === "object" && value !== null && "value" in value) {
    return (value as Collection<T>).value() as T[];
  }
  return value as T[];
};

export type ScatterProps = {
  name?: string;
  key?: string;
  x?: MaybeValue<number>[];
  y?: MaybeValue<number>[];
  /** Range form: position each child so it spans [xMin[i], xMax[i]] in data space. */
  xMin?: MaybeValue<number>[];
  xMax?: MaybeValue<number>[];
  yMin?: MaybeValue<number>[];
  yMax?: MaybeValue<number>[];
  alignment?: Alignment;
} & FancyDims<MaybeValue<number>>;

function getCurrentAnchor(
  child: Placeable,
  axis: 0 | 1,
  anchor: "min" | "center" | "max" | "baseline"
) {
  const dims = child.dims[axis];
  const min = dims.min ?? 0;
  const size = dims.size ?? 0;
  const max = dims.max ?? min + size;
  const center = dims.center ?? min + size / 2;

  switch (anchor) {
    case "min":
      return min;
    case "center":
      return center;
    case "max":
      return max;
    case "baseline":
      return 0;
  }
}

function setAxisTranslation(
  child: Placeable,
  axis: 0 | 1,
  target: number,
  anchor: "min" | "center" | "max" | "baseline"
) {
  const node = child as GoFishNode;
  const delta = target - getCurrentAnchor(child, axis, anchor);
  node.transform!.translate![axis] =
    (node.transform!.translate![axis] ?? 0) + delta;
}

function resolvePositionSpace(
  values: MaybeValue<number>[] | undefined
): UnderlyingSpace {
  if (!values || values.length === 0) return UNDEFINED;
  if (!values.every((value) => isValue(value))) return UNDEFINED;
  const rawValues = values.map((value) => getValue(value)!);
  return POSITION(
    Interval.interval(Math.min(...rawValues), Math.max(...rawValues))
  );
}

export const Scatter = createNodeOperator(
  (options: ScatterProps, children: GoFishAST[] | Collection<GoFishAST>) => {
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
      ...fancyDims
    } = options;
    children = unwrapLodashArray(children);
    const dims = elaborateDims(fancyDims);

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

    // Track whether the align axis came from SIZE (so alignChildren knows to run)
    let xFromSize = false;
    let yFromSize = false;

    return new GoFishNode(
      {
        type: "scatter",
        key,
        name,
        args: { key, name, x, y, xMin, xMax, yMin, yMax, alignment, dims },
        shared: [false, false],
        resolveUnderlyingSpace: (
          childSpaces: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[]
        ) => {
          let xSpace: UnderlyingSpace;
          if (x !== undefined) {
            xSpace = resolvePositionSpace(x);
          } else if (xMin !== undefined && xMax !== undefined) {
            xSpace = POSITION(
              Interval.interval(
                Math.min(...xMin.map((v) => getValue(v)!)),
                Math.max(...xMax.map((v) => getValue(v)!))
              )
            );
          } else {
            const result = resolveAlignmentSpace(
              childSpaces.map((child) => child[0]),
              alignment
            );
            xSpace = result.space;
            xFromSize = result.fromSize;
          }

          let ySpace: UnderlyingSpace;
          if (y !== undefined) {
            ySpace = resolvePositionSpace(y);
          } else if (yMin !== undefined && yMax !== undefined) {
            ySpace = POSITION(
              Interval.interval(
                Math.min(...yMin.map((v) => getValue(v)!)),
                Math.max(...yMax.map((v) => getValue(v)!))
              )
            );
          } else {
            const result = resolveAlignmentSpace(
              childSpaces.map((child) => child[1]),
              alignment
            );
            ySpace = result.space;
            yFromSize = result.fromSize;
          }

          return [xSpace, ySpace];
        },
        layout: (_shared, size, scaleFactors, childNodes, posScales) => {
          const childPlaceables = childNodes.map((child) =>
            child.layout(size, scaleFactors, posScales)
          );

          childPlaceables.forEach((child) => {
            child.place("x", 0);
            child.place("y", 0);
          });

          childPlaceables.forEach((child, index) => {
            const xPos = x?.[index];
            const yPos = y?.[index];

            if (xMin !== undefined && xMax !== undefined) {
              // Range mode: stretch child to span [xMin, xMax] in data space
              const node = child as GoFishNode;
              const xMinPx = posScales[0]!(getValue(xMin[index])!);
              const xMaxPx = posScales[0]!(getValue(xMax[index])!);
              const width = xMaxPx - xMinPx;
              node.transform!.translate![0] = xMinPx;
              node.intrinsicDims![0] = {
                ...(node.intrinsicDims![0] ?? {}),
                min: 0,
                size: width,
                center: width / 2,
                max: width,
              } as Dimensions[0];
            } else if (xPos !== undefined) {
              const resolvedX = isValue(xPos)
                ? posScales[0]!(getValue(xPos)!)
                : xPos;
              setAxisTranslation(child, 0, resolvedX, "center");
            }

            if (yMin !== undefined && yMax !== undefined) {
              // Range mode: stretch child to span [yMin, yMax] in data space
              const node = child as GoFishNode;
              const yMinPx = posScales[1]!(getValue(yMin[index])!);
              const yMaxPx = posScales[1]!(getValue(yMax[index])!);
              const height = yMaxPx - yMinPx;
              node.transform!.translate![1] = yMinPx;
              node.intrinsicDims![1] = {
                ...(node.intrinsicDims![1] ?? {}),
                min: 0,
                size: height,
                center: height / 2,
                max: height,
              } as Dimensions[1];
            } else if (yPos !== undefined) {
              const resolvedY = isValue(yPos)
                ? posScales[1]!(getValue(yPos)!)
                : yPos;
              setAxisTranslation(child, 1, resolvedY, "center");
            }
          });

          // Align children on axes scatter doesn't position (spread-style semantics)
          ([0, 1] as const).forEach((axis) => {
            const positions = axis === 0 ? x : y;
            const isRangeAxis =
              axis === 0
                ? xMin !== undefined && xMax !== undefined
                : yMin !== undefined && yMax !== undefined;
            if (positions !== undefined || isRangeAxis) return;

            const fromSize = axis === 0 ? xFromSize : yFromSize;
            alignChildren(
              childPlaceables,
              axis,
              alignment,
              size[axis],
              posScales?.[axis],
              fromSize
            );
          });

          const minX = Math.min(
            ...childPlaceables.map((child) => child.dims[0].min!)
          );
          const maxX = Math.max(
            ...childPlaceables.map((child) => child.dims[0].max!)
          );
          const minY = Math.min(
            ...childPlaceables.map((child) => child.dims[1].min!)
          );
          const maxY = Math.max(
            ...childPlaceables.map((child) => child.dims[1].max!)
          );

          return {
            intrinsicDims: [
              {
                min: minX,
                size: maxX - minX,
                center: minX + (maxX - minX) / 2,
                max: maxX,
              },
              {
                min: minY,
                size: maxY - minY,
                center: minY + (maxY - minY) / 2,
                max: maxY,
              },
            ],
            transform: {
              translate: [hasX ? 0 : undefined, hasY ? 0 : undefined],
            },
          };
        },
        render: ({ transform }, children) => {
          return (
            <g
              transform={`translate(${transform?.translate?.[0] ?? 0}, ${transform?.translate?.[1] ?? 0})`}
            >
              {children}
            </g>
          );
        },
      },
      children
    );
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
  by?: string;
  x?: string | number | MaybeValue<number>[];
  y?: string | number | MaybeValue<number>[];
  xMin?: string | MaybeValue<number>[];
  xMax?: string | MaybeValue<number>[];
  yMin?: string | MaybeValue<number>[];
  yMax?: string | MaybeValue<number>[];
  alignment?: "start" | "middle" | "end" | "baseline";
  debug?: boolean;
};

export const scatter = createOperator<any, ScatterOptions>(Scatter, {
  // When no `by` is given, pass each item through as-is. Items may already be
  // arrays or scalars; downstream marks/channels handle either form.
  split: ({ by }, d) =>
    by ? Map.groupBy(d, (r: any) => r[by]) : new Map(d.map((r, i) => [i, r])),
  channels: {
    x: { type: "pos", entry: true },
    y: { type: "pos", entry: true },
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
});
