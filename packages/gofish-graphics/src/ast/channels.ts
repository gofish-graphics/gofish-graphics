// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// @wiki The Mark Factory — /internals/frontend/mark-factory
// </gofish-wiki>

import { sumBy, meanBy } from "lodash";
import {
  MaybeValue,
  Value,
  value,
  isField,
  isLiteral,
  getMeasureProvenance,
  type FieldAccessor,
  type LiteralValue,
  type Measure,
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
 * Resolve a channel's {@link Measure} from its three sources, treating measures
 * as TYPES (issue #266's field/datum/literal trichotomy, completed). The three
 * sources, in checking order:
 *   1. Explicit annotation — `field(name, measure)`. A real type claim.
 *   2. Inferred provenance — the {@link getMeasureProvenance} map a transform
 *      like `bin()` attached to the data array. Also a real type claim.
 *   3. Field-name default — a bare string accessor's field name. A WEAK default
 *      binding, not a claim.
 *
 * Checking rule:
 *   - annotation AND provenance both present and disagree → THROW immediately
 *     here (before any space union runs), naming the field and both measures;
 *   - annotation present (no conflict) → annotation (refines the weak default);
 *   - no annotation → provenance ?? field-name default.
 *
 * `provenanceData` is the provenance-bearing array (the operator's whole input,
 * which retains the symbol across `derive`); when omitted it falls back to the
 * value array. Function accessors and literals have no field identity → no
 * measure.
 */
export const resolveMeasure = <T>(
  provenanceData: T | T[],
  accessor:
    | string
    | number
    | ((d: T) => unknown)
    | FieldAccessor
    | LiteralValue
    | undefined
): Measure | undefined => {
  let fieldName: string | undefined;
  let annotation: Measure | undefined;
  if (isField(accessor)) {
    fieldName = accessor.name;
    annotation = accessor.measure;
  } else if (typeof accessor === "string") {
    fieldName = accessor;
  } else {
    return undefined; // function / number / literal: no field identity
  }
  const arr = Array.isArray(provenanceData) ? provenanceData : [provenanceData];
  const provenance = getMeasureProvenance(arr)?.[fieldName];
  if (
    annotation !== undefined &&
    provenance !== undefined &&
    annotation !== provenance
  ) {
    throw new Error(
      `Measure conflict on field "${fieldName}": annotated as "${annotation}" ` +
        `via field(name, measure) but its provenance (e.g. bin()) says ` +
        `"${provenance}". These are contradictory type claims — drop the ` +
        `annotation or fix the upstream transform.`
    );
  }
  if (annotation !== undefined) return annotation;
  return provenance ?? fieldName;
};

/**
 * Infer a size value from a field name, function accessor, or literal number.
 * - number: passed through as a literal.
 * - string (field name): sums the field across the data array.
 * - function: called per-row and summed across the data array.
 *
 * Field/string accessors are tagged with their resolved {@link Measure} (see
 * {@link resolveMeasure}) so the underlying-space layer can unify per measure.
 * `provenanceData` carries the measure-provenance symbol when the value array
 * itself does not (e.g. a per-entry slice of a binned array).
 */
export const inferSize = <T>(
  accessor:
    | string
    | number
    | ((d: T) => number)
    | FieldAccessor
    | LiteralValue
    | undefined,
  d: T | T[],
  provenanceData: T | T[] = d
): MaybeValue<number> | undefined => {
  if (accessor === undefined) return undefined;
  if (typeof accessor === "number") return accessor;
  if (isLiteral(accessor)) return accessor.value as number;
  const data = Array.isArray(d) ? d : [d];
  const measure = resolveMeasure(provenanceData, accessor);
  if (isField(accessor)) {
    return value(sumBy(data, accessor.name as any), measure);
  }
  return value(sumBy(data, accessor as any), measure);
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
  d: T | T[],
  provenanceData: T | T[] = d
): MaybeValue<number> | undefined => {
  if (accessor === undefined) return undefined;
  if (typeof accessor === "number") return accessor;
  if (isLiteral(accessor)) return accessor.value as number;
  const data = Array.isArray(d) ? d : [d];
  const measure = resolveMeasure(provenanceData, accessor);
  if (isField(accessor)) {
    return value(meanBy(data, accessor.name as any), measure);
  }
  return value(meanBy(data, accessor as any), measure);
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
