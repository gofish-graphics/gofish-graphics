import { sumBy, meanBy } from "lodash";
import { MaybeValue, Value, value } from "./data";

export type ChannelType = "size" | "pos" | "color" | "raw";

/**
 * Channel spec. The plain string form is the default (aggregate over all data
 * via `inferSize`/`inferPos`/`inferColor` — produces a single value). The
 * object form adds flags — `entry: true` produces a per-row array instead of
 * an aggregate, used by expand-kind marks (e.g. `cut`) where each datum maps
 * to one output node and the channel value differs per node.
 */
export type ChannelSpec = ChannelType | { type: ChannelType; entry?: boolean };

export type ChannelAnnotations<T> = {
  [K in keyof T]?: ChannelSpec;
};

/**
 * Derive mark prop types from shape prop types + channel annotations.
 *
 * - "size" channels: mark accepts `number | keyof T | Value<number>` instead of `MaybeValue<number>`
 * - "color" channels: mark accepts `string | keyof T | Value<string>` instead of `MaybeValue<string>`
 * - unannotated props: passed through with the same type
 */
export type DeriveMarkProps<
  ShapeProps,
  Channels extends ChannelAnnotations<ShapeProps>,
  T extends Record<string, any>,
> = {
  [K in keyof ShapeProps]: K extends keyof Channels
    ? // Entry-flagged size: mark accepts a field name or an explicit
      // per-row array (used by expand-kind marks like `cut`).
      Channels[K] extends { type: "size"; entry: true }
      ? (keyof T & string) | MaybeValue<number>[] | undefined
      : Channels[K] extends "size" | { type: "size" }
        ?
            | number
            | (keyof T & string)
            | ((d: T) => number)
            | Value<number>
            | undefined
        : Channels[K] extends "pos" | { type: "pos" }
          ?
              | number
              | (keyof T & string)
              | ((d: T) => number)
              | Value<number>
              | undefined
          : Channels[K] extends "color" | { type: "color" }
            ?
                | string
                | (keyof T & string)
                | ((d: T) => string)
                | Value<string>
                | undefined
            : Channels[K] extends "raw" | { type: "raw" }
              ?
                  | string
                  | number
                  | (keyof T & string)
                  | ((d: T) => string | number)
                  | Value<string | number>
                  | undefined
              : ShapeProps[K]
    : ShapeProps[K];
} & { debug?: boolean };

/**
 * Infer a size value from a field name, function accessor, or literal number.
 * - number: passed through as a literal.
 * - string (field name): sums the field across the data array.
 * - function: called per-row and summed across the data array.
 */
export const inferSize = <T>(
  accessor: string | number | ((d: T) => number) | undefined,
  d: T | T[]
): MaybeValue<number> | undefined => {
  if (accessor === undefined) return undefined;
  if (typeof accessor === "number") return accessor;
  const data = Array.isArray(d) ? d : [d];
  return value(sumBy(data, accessor as any));
};

/**
 * Entry-flagged size resolver: produces a per-row array instead of a sum.
 * Used by expand-kind marks (e.g. `cut`) where each datum maps to one output
 * node and the channel value differs per node.
 *
 * - `number[]` / `MaybeValue<number>[]`: passed through.
 * - `string` (field name): mapped per-row to `Number(d[field]) || 0`.
 * - function: called per-row.
 * - `undefined`: returns `undefined` (caller decides default — typically equal slices).
 */
export const inferEntrySize = <T>(
  accessor: string | MaybeValue<number>[] | ((d: T) => number) | undefined,
  data: T[]
): MaybeValue<number>[] | undefined => {
  if (accessor === undefined) return undefined;
  if (Array.isArray(accessor)) return accessor;
  if (typeof accessor === "function") {
    return data.map((d) => value(accessor(d)));
  }
  if (typeof accessor === "string") {
    return data.map((d) => value(Number((d as any)[accessor]) || 0));
  }
  return undefined;
};

/**
 * Infer a position value from a field name, function accessor, or literal number.
 * - number: passed through as a literal.
 * - string (field name): averages the field across the data array.
 * - function: called per-row and averaged across the data array.
 */
export const inferPos = <T>(
  accessor: string | number | ((d: T) => number) | undefined,
  d: T | T[]
): MaybeValue<number> | undefined => {
  if (accessor === undefined) return undefined;
  if (typeof accessor === "number") return accessor;
  const data = Array.isArray(d) ? d : [d];
  return value(meanBy(data, accessor as any));
};

/**
 * Infer a color value from a field name, function accessor, or literal string.
 * - string matching a field in data[0]: wraps field value as a Value.
 * - string not matching a field: passes through as a literal color.
 * - function: called on data[0] and wraps the result as a Value.
 */
export const inferColor = <T extends Record<string, any>>(
  accessor: string | ((d: T) => string) | undefined,
  data: T[]
): MaybeValue<string> | undefined => {
  if (accessor === undefined) return undefined;
  if (typeof accessor === "function") {
    return data.length > 0 && data[0] != null
      ? value(accessor(data[0]))
      : undefined;
  }
  if (data.length > 0 && data[0] != null && accessor in data[0]) {
    return value(data[0][accessor]);
  }
  return accessor;
};

/**
 * Infer a raw scalar value from a field name, function accessor, or literal.
 * - number: passed through as a literal.
 * - string matching a field in data[0]: wraps field value as a Value.
 * - string not matching a field: passes through as a literal string.
 * - function: called on data[0] and wraps the result as a Value.
 * No aggregation — suitable for text content, labels, unscaled identifiers.
 */
export const inferRaw = <T extends Record<string, any>>(
  accessor: string | number | ((d: T) => string | number) | undefined,
  data: T[]
): MaybeValue<string | number> | undefined => {
  if (accessor === undefined) return undefined;
  if (typeof accessor === "number") return accessor;
  if (typeof accessor === "function") {
    return data.length > 0 && data[0] != null
      ? value(accessor(data[0]))
      : undefined;
  }
  if (data.length > 0 && data[0] != null && accessor in data[0]) {
    return value(data[0][accessor]);
  }
  return accessor;
};
