// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// @wiki The Mark Factory — /internals/frontend/mark-factory
// </gofish-wiki>

import meanBy from "lodash/meanBy";
import sumBy from "lodash/sumBy";
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

/**
 * Channel spec. The plain string form is the default (aggregate over all data
 * via `inferSize`/`inferPos`/`inferColor` — produces a single value). The
 * object form adds flags — `entry: true` produces a per-row array instead of
 * an aggregate, used by expand-kind marks (e.g. `cut`) where each datum maps
 * to one output node and the channel value differs per node.
 */
export type ChannelSpec =
  | ChannelType
  | { type: ChannelType; entry?: boolean; discrete?: boolean };

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
  // Only an array can carry the provenance symbol (a transform tags the array,
  // not each row), so skip the lookup for a single datum.
  const provenance = Array.isArray(provenanceData)
    ? getMeasureProvenance(provenanceData)?.[fieldName]
    : undefined;
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
 * Shared core of {@link inferSize} / {@link inferPos}: they differ only in the
 * lodash aggregation (`sumBy` vs `meanBy`). Resolves a numeric value from a
 * field name, function accessor, or literal number:
 * - number / literal: passed through as a literal.
 * - string (field name): aggregated across the data array.
 * - function: called per-row and aggregated across the data array.
 *
 * Field/string accessors are tagged with a resolved {@link Measure} so the
 * underlying-space layer can unify per measure. The caller may pass a
 * precomputed `measure` (createOperator resolves it once per channel from the
 * provenance-bearing array); when omitted we resolve it locally from `d` — the
 * same behavior as resolving against the value array directly.
 */
const inferNumeric =
  (agg: typeof sumBy) =>
  <T>(
    accessor:
      | string
      | number
      | ((d: T) => number)
      | FieldAccessor
      | LiteralValue
      | undefined,
    d: T | T[],
    measure?: Measure
  ): MaybeValue<number> | undefined => {
    if (accessor === undefined) return undefined;
    if (typeof accessor === "number") return accessor;
    if (isLiteral(accessor)) return accessor.value as number;
    const data = Array.isArray(d) ? d : [d];
    const m = measure ?? resolveMeasure(d, accessor);
    return value(
      agg(data, (isField(accessor) ? accessor.name : accessor) as any),
      m
    );
  };

/** Infer a size value (sums the field/function across the data array). */
export const inferSize = inferNumeric(sumBy);

/** Infer a position value (averages the field/function across the data array). */
export const inferPos = inferNumeric(meanBy);

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
