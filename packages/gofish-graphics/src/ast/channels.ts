// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki The Mark Factory — /internals/frontend/mark-factory
// </gofish-wiki>

import { sumBy, meanBy } from "lodash";
import {
  MaybeValue,
  Value,
  value,
  isField,
  isLiteral,
  type FieldAccessor,
  type LiteralValue,
} from "./data";

export type ChannelType = "size" | "pos" | "color" | "raw";

export type ChannelAnnotations<T> = {
  [K in keyof T]?: ChannelType;
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
    ? Channels[K] extends "size"
      ?
          | number
          | (keyof T & string)
          | ((d: T) => number)
          | Value<number>
          | undefined
      : Channels[K] extends "pos"
        ?
            | number
            | (keyof T & string)
            | ((d: T) => number)
            | Value<number>
            | undefined
        : Channels[K] extends "color"
          ?
              | string
              | (keyof T & string)
              | ((d: T) => string)
              | Value<string>
              | undefined
          : Channels[K] extends "raw"
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
  accessor:
    | string
    | number
    | ((d: T) => number)
    | FieldAccessor
    | LiteralValue
    | undefined,
  d: T | T[]
): MaybeValue<number> | undefined => {
  if (accessor === undefined) return undefined;
  if (typeof accessor === "number") return accessor;
  if (isLiteral(accessor)) return accessor.value as number;
  const data = Array.isArray(d) ? d : [d];
  if (isField(accessor)) {
    return value(sumBy(data, accessor.name as any));
  }
  return value(sumBy(data, accessor as any));
};

/**
 * Infer a position value from a field name, function accessor, or literal number.
 * - number: passed through as a literal.
 * - string (field name): averages the field across the data array.
 * - function: called per-row and averaged across the data array.
 */
export const inferPos = <T>(
  accessor:
    | string
    | number
    | ((d: T) => number)
    | FieldAccessor
    | LiteralValue
    | undefined,
  d: T | T[]
): MaybeValue<number> | undefined => {
  if (accessor === undefined) return undefined;
  if (typeof accessor === "number") return accessor;
  if (isLiteral(accessor)) return accessor.value as number;
  const data = Array.isArray(d) ? d : [d];
  if (isField(accessor)) {
    return value(meanBy(data, accessor.name as any));
  }
  return value(meanBy(data, accessor as any));
};

/**
 * Infer a color value from a field name, function accessor, or literal string.
 * - string matching a field in data[0]: wraps field value as a Value.
 * - string not matching a field: passes through as a literal color.
 * - function: called on data[0] and wraps the result as a Value.
 */
export const inferColor = <T extends Record<string, any>>(
  accessor:
    | string
    | ((d: T) => string)
    | FieldAccessor
    | LiteralValue
    | undefined,
  data: T[]
): MaybeValue<string> | undefined => {
  if (accessor === undefined) return undefined;
  if (isLiteral(accessor)) return accessor.value as string;
  if (isField(accessor)) {
    return data.length > 0 && data[0] != null
      ? value(data[0][accessor.name])
      : undefined;
  }
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
export const inferRaw = async <T extends Record<string, any>>(
  accessor:
    | string
    | number
    | ((d: T) => string | number | Promise<string | number>)
    | FieldAccessor
    | LiteralValue
    | undefined,
  data: T[]
): Promise<MaybeValue<string | number> | undefined> => {
  if (accessor === undefined) return undefined;
  if (typeof accessor === "number") return accessor;
  if (isLiteral(accessor)) return accessor.value as string | number;
  if (isField(accessor)) {
    return data.length > 0 && data[0] != null
      ? value(data[0][accessor.name])
      : undefined;
  }
  if (typeof accessor === "function") {
    if (data.length > 0 && data[0] != null) {
      // Awaiting on a non-Promise is a no-op, so this transparently
      // supports both sync `(d) => d.amount` accessors and async ones
      // (e.g. the Python-bridge arrow the harness installs for
      // `text({text: <__gofish_lambda sentinel>})`).
      return value(await accessor(data[0]));
    }
    return undefined;
  }
  if (data.length > 0 && data[0] != null && accessor in data[0]) {
    return value(data[0][accessor]);
  }
  return accessor;
};
