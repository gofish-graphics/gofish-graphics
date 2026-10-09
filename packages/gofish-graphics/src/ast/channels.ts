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
  DatumValueImpl,
  isField,
  isLiteral,
  isValue,
  getMeasureProvenance,
  type FieldAccessor,
  type LiteralValue,
  type Measure,
} from "./data";
import { Frontend } from "gofish-ir";
import { evalFieldValues, type FieldExpr } from "./fieldExpr";
import { columnType } from "./schema";
import {
  mapAxisDims,
  type AxisDims,
  type AxisDimsForm,
  type AxisDimsSlot,
} from "./dims";
import type { LiveValue } from "../interaction/live";

/**
 * How a channel encodes data. `dims` is the axis-name-keyed bag of box
 * dimensions (a `dims` option): each of its slots is a channel of its own. As
 * a plain `"dims"` spec, a slot is a `size` or a `pos` channel according to its
 * structure ({@link axisSlotKind}); a {@link DimsChannelSpec} makes each slot
 * the channel of its top-level counterpart instead.
 */
export type ChannelType = "size" | "pos" | "color" | "raw" | "dims";

/**
 * Channel spec. The plain string form is the default (aggregate over all data
 * via `inferSize`/`inferPos`/`inferColor` — produces a single value). The
 * object form adds flags — `entry: true` produces a per-row array instead of
 * an aggregate, used by expand-kind marks (e.g. `cut`) where each datum maps
 * to one output node and the channel value differs per node.
 *
 * `C` narrows which channel types are admissible: the operator factory
 * (marks/createOperator.ts) narrows it to exclude "raw".
 */
export type ChannelSpec<C extends ChannelType = ChannelType> =
  | C
  | { type: C; entry?: boolean; discrete?: boolean }
  | ("dims" extends C ? DimsChannelSpec : never);

/**
 * A `dims` option whose slots infer exactly as the top-level options they
 * stand for: the slot for anchor `k` is the channel `form.topLevel[k]` names
 * (scatter's bare value and `center` infer as `x`, its `min` as `xMin`). The
 * counterparts on the two axes must share one spec, since a slot's axis is
 * known only once the enclosing coordinate space is. A counterpart with no
 * channel leaves the slot as given.
 */
export type DimsChannelSpec = { type: "dims"; form: AxisDimsForm };

/** The channel kind of a `dims` slot by its structure: `size` is a size, a
 *  bare value or `min`/`center`/`max` a position. */
export const axisSlotKind = (slot: AxisDimsSlot): "pos" | "size" =>
  slot === "size" ? "size" : "pos";

export type ChannelAnnotations<T, C extends ChannelType = ChannelType> = {
  [K in keyof T]?: ChannelSpec<C>;
};

/**
 * Derive mark prop types from shape prop types + channel annotations.
 *
 * - "size" channels: mark accepts `number | keyof T | Value<number> | FieldExpr`
 *   instead of `MaybeValue<number>` — a `field(...)` pipeline (e.g.
 *   `field("age").count()`) is evaluated the same way a bare field-name
 *   accessor is (see `evalFieldValues` in fieldExpr.ts).
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
            | FieldExpr
            | undefined
        : Channels[K] extends "pos" | { type: "pos" }
          ?
              | number
              | (keyof T & string)
              | ((d: T) => number)
              | Value<number>
              | FieldExpr
              | undefined
          : Channels[K] extends "color" | { type: "color" }
            ?
                | string
                | (keyof T & string)
                | ((d: T) => string)
                | Value<string>
                // `live(...)` reactive color (paint patch; returns a literal
                // color — see src/interaction/live.ts).
                | LiveValue
                | undefined
            : Channels[K] extends "raw" | { type: "raw" }
              ?
                  | string
                  | number
                  | (keyof T & string)
                  | ((d: T) => string | number)
                  | Value<string | number>
                  // `live(...)` reactive content (paint patch; the pipeline
                  // measures the resolve-time value).
                  | LiveValue
                  | undefined
              : Channels[K] extends "dims" | { type: "dims" }
                ?
                    | AxisDims<
                        | number
                        | (keyof T & string)
                        | ((d: T) => number)
                        | Value<number>
                        | FieldExpr
                      >
                    | undefined
                : ShapeProps[K]
    : ShapeProps[K];
} & { debug?: boolean };

/**
 * Resolve a channel's {@link Measure} from its three sources, treating measures
 * as TYPES (the field/datum/literal trichotomy). The three sources, in checking
 * order:
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
 * field name, field expression, function accessor, or literal number:
 * - number / literal: passed through as a literal.
 * - `datum(...)`: already a data value, passed through as-is.
 * - string / function / field expression: evaluated per-row via
 *   `evalFieldValues` (fieldExpr.ts) — an aggregate op like `.mean()` folds
 *   the rows there — then aggregated across whatever that evaluation produced.
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
      | Value<number>
      | undefined,
    d: T | T[],
    measure?: Measure
  ): MaybeValue<number> | undefined => {
    if (accessor === undefined) return undefined;
    if (typeof accessor === "number") return accessor;
    if (isLiteral(accessor)) return accessor.value as number;
    if (isValue(accessor)) return accessor as MaybeValue<number>;
    const data = Array.isArray(d) ? d : [d];
    // Expression evaluation is orthogonal to this channel: the pipeline maps
    // the rows to values, and an aggregate op (`.mean()`, `.count()`, ...)
    // folds them to a singleton. The channel then applies its default
    // aggregation exactly as it always did — over a folded singleton, sum and
    // mean are both the identity, so neither side knows about the other.
    const { values, measure: pipelineMeasure } = evalFieldValues(
      accessor,
      data
    );
    const m = pipelineMeasure ?? measure ?? resolveMeasure(d, accessor);
    return value(agg(values as any[]), m);
  };

/** Infer a size value (sums the field/function across the data array). */
export const inferSize = inferNumeric(sumBy);

/** Infer a position value (averages the field/function across the data array). */
export const inferPos = inferNumeric(meanBy);

/**
 * Shared core of the non-aggregating channels ({@link inferColor} /
 * {@link inferRaw}): resolve an accessor against the FIRST row of `data`.
 * - "literal": pass the accessor's value through unchanged — a `literal(...)`
 *   wrapper, or a string that names no field on the row (e.g. a CSS color).
 * - "row": the value read off the row, with the `field` it was read from when
 *   the accessor named one (not for a function accessor). The caller wraps it
 *   in `value(...)`.
 * - "none": there is no usable row to read.
 */
function firstRowValue<T extends Record<string, any>>(
  accessor: string | ((d: T) => any) | FieldAccessor | LiteralValue,
  data: T[]
):
  | { kind: "literal"; value: unknown }
  | { kind: "row"; value: unknown; field?: string }
  | { kind: "none" } {
  if (isLiteral(accessor)) return { kind: "literal", value: accessor.value };
  const row = data.length > 0 && data[0] != null ? data[0] : undefined;
  if (isField(accessor)) {
    return row === undefined
      ? { kind: "none" }
      : { kind: "row", value: row[accessor.name], field: accessor.name };
  }
  if (typeof accessor === "function") {
    return row === undefined
      ? { kind: "none" }
      : { kind: "row", value: accessor(row) };
  }
  if (row !== undefined && accessor in row) {
    return { kind: "row", value: row[accessor], field: accessor };
  }
  return { kind: "literal", value: accessor };
}

/**
 * Infer a color value from a field name, function accessor, or literal string.
 * A string that names a field on the data becomes that field's value; one that
 * doesn't passes through as a literal color. A value read from a named field
 * (a field-name string or `field(...)`) records that field as its provenance
 * (`DatumValueImpl.field`), so the color scale knows which field it maps.
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
  const resolved = firstRowValue(accessor, data);
  if (resolved.kind === "none") return undefined;
  return resolved.kind === "literal"
    ? (resolved.value as string)
    : colorValue(resolved.value, resolved.field, data);
};

/** A value read off a row for a color channel, with the `field` it was read
 *  from (for a field name) as its provenance and that column's schema type
 *  from `data`. Shared by {@link inferColor} and the connector paint, which
 *  reads its value through `projectBy`. */
export const colorValue = (
  read: unknown,
  field?: string,
  data?: unknown
): DatumValueImpl =>
  new DatumValueImpl(
    read as string,
    undefined,
    undefined,
    undefined,
    field,
    columnType(data, field)
  );

/**
 * Infer a raw scalar value from a field name, function accessor, or literal.
 * Same resolution as {@link inferColor} (plus numbers), with no aggregation —
 * suitable for text content, labels, unscaled identifiers. A Python accessor
 * has already been resolved by {@link resolveChannelAccessors}.
 */
export const inferRaw = <T extends Record<string, any>>(
  accessor:
    | string
    | number
    | ((d: T) => string | number)
    | FieldAccessor
    | LiteralValue
    | undefined,
  data: T[]
): MaybeValue<string | number> | undefined => {
  if (accessor === undefined) return undefined;
  if (typeof accessor === "number") return accessor;
  const resolved = firstRowValue(accessor, data);
  if (resolved.kind === "none") return undefined;
  return resolved.kind === "literal"
    ? (resolved.value as string | number)
    : value(resolved.value);
};

/** The symbol under which an accessor carries its batch form: given the rows,
 *  the value for each row, in one call. A Python accessor arrives this way
 *  (`makeLambdaAccessor` in serialize/fromJSON.ts). */
export const RESOLVE_ROWS: unique symbol = Symbol.for("gofish.resolveRows");

/** An accessor that has a batch form. */
export type BatchAccessor = ((row: any) => unknown) & {
  [RESOLVE_ROWS]: (rows: readonly unknown[]) => Promise<unknown[]>;
};

const isBatchAccessor = (v: unknown): v is BatchAccessor =>
  typeof v === "function" && RESOLVE_ROWS in v;

/** Whether a channel value holds a batch accessor, at any depth of its plain
 *  objects (a `dims` bag). */
const holdsBatchAccessor = (v: unknown): boolean =>
  isBatchAccessor(v) ||
  (Frontend.isPlainObject(v) && Object.values(v).some(holdsBatchAccessor));

/** A synchronous accessor that reads a resolved value back by row. */
const readByRow =
  (byRow: Map<unknown, unknown>) =>
  (row: unknown): unknown => {
    if (!byRow.has(row)) {
      throw new Error(
        "a Python channel accessor was read on a row it was not resolved " +
          "over. resolveChannelAccessors must be given every row inference reads."
      );
    }
    return byRow.get(row);
  };

/** Resolve the batch accessors in one channel value over `rows`: each is
 *  called once, with all the rows, and replaced by {@link readByRow}. A plain
 *  object is rebuilt only when a child changed. */
async function resolveValue(
  value: unknown,
  rows: readonly unknown[]
): Promise<unknown> {
  if (isBatchAccessor(value)) {
    const values = await value[RESOLVE_ROWS](rows);
    return readByRow(new Map(rows.map((row, i) => [row, values[i]])));
  }
  if (!Frontend.isPlainObject(value) || !holdsBatchAccessor(value)) {
    return value;
  }
  const entries = Object.entries(value);
  const resolved = await Promise.all(
    entries.map(([, v]) => resolveValue(v, rows))
  );
  return Object.fromEntries(entries.map(([k], i) => [k, resolved[i]]));
}

/**
 * Resolve the batch accessors in the channels of `opts`, so channel inference
 * stays synchronous (#1080). A Python lambda reaches JS as an accessor with a
 * batch form ({@link RESOLVE_ROWS}): it is called once with every row, and
 * inference gets a synchronous accessor that reads each row's value back. An
 * accessor nested in a `dims` bag is resolved too. Options that are not
 * channels are left as they are.
 *
 * `rowsOf` gives every row inference will read; the operator factory gives
 * its whole input plus each split entry's rows. When no channel holds a batch
 * accessor (the common case), `opts` comes back as it is, synchronously, and
 * `rowsOf` is never called. The mark factory and the operator factory call
 * this right before inference; it is the one place a Python accessor runs.
 */
export function resolveChannelAccessors<O extends Record<string, any>>(
  opts: O,
  channels: Record<string, unknown> | undefined,
  rowsOf: () => readonly unknown[]
): O | Promise<O> {
  const keys = Object.keys(channels ?? {}).filter((k) =>
    holdsBatchAccessor(opts[k])
  );
  if (keys.length === 0) return opts;
  const rows = rowsOf();
  return Promise.all(keys.map((k) => resolveValue(opts[k], rows))).then(
    (values) => {
      const out: Record<string, any> = { ...opts };
      keys.forEach((k, i) => (out[k] = values[i]));
      return out as O;
    }
  );
}

/**
 * The one channel-type → inference dispatch table, shared by the mark factory
 * (`buildCreatedMark` in withGoFish.ts) and the operator factory
 * (`applyChannels` in marks/createOperator.ts).
 *
 * `measure` is the channel's resolved {@link Measure}, computed once per
 * channel from the whole input array (which carries the measure-provenance
 * symbol even when `data` is a per-entry slice that does not) and passed down
 * so `inferSize`/`inferPos` don't recompute it per split entry. Only they
 * consume it.
 */
export const CHANNEL_INFER: Record<
  ChannelType,
  (val: any, data: any[], measure?: Measure) => any
> = {
  size: (val, data, measure) => inferSize(val, data, measure),
  pos: (val, data, measure) => inferPos(val, data, measure),
  color: (val, data) => inferColor(val, data),
  raw: (val, data) => inferRaw(val, data),
  // Each slot resolves its own measure from `data`: the slots are separate
  // channels that happen to share one option.
  dims: (val: AxisDims<any>, data) =>
    mapAxisDims(val, (v, slot) => CHANNEL_INFER[axisSlotKind(slot)](v, data)),
};
