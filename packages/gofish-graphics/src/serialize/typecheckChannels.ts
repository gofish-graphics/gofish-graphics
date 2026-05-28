// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * Channel elaboration + typechecking against the inline-data schema — the
 * data-aware half of the cheap, pre-resolution typecheck (issues #452/#457).
 *
 * When a chart's data is available inline, the type of each column is read off
 * the **first row** and used as the typing context. Every channel argument is
 * then *elaborated* to either a field access (the string names a column) or a
 * literal (it doesn't), and *typechecked* against the type the channel expects:
 *
 *  - `size` / `pos` channels expect numbers — a field bound to them must be a
 *    numeric column; a literal must be a number.
 *  - `color` channels expect a CSS color string when given a literal; a bound
 *    field is fine (it's mapped through a color scale, so any column type).
 *  - `raw` channels accept any scalar.
 *
 * The schema is **opaque past a `derive`**: an arbitrary user transform can
 * rename/retype columns, so once a `derive` (or any untagged operator) sits
 * between the data and the mark, no schema is known and elaboration falls back
 * to "opaque" — strings can't be resolved to fields, and only the type errors
 * that need no schema (a literal number/string in the wrong slot) are reported.
 *
 * Mirrors the runtime channel resolvers (`inferSize`/`inferPos`/`inferColor`/
 * `inferRaw` in `ast/channels.ts`): "string that names a column → field, else
 * literal" is exactly their rule, lifted to a static check over `data[0]`.
 */

import { isField, isLiteral, isValue } from "../ast/data";

/** The JS runtime type of a column value, as read from the first row. */
export type DataType =
  | "number"
  | "string"
  | "boolean"
  | "null"
  | "object"
  | "undefined";

/** A column-name → type map inferred from a single data row. */
export type RowSchema = Record<string, DataType>;

/** The result of elaborating one channel argument. */
export type ElaboratedArg =
  | { kind: "field"; name: string; dataType: DataType | "unknown" }
  | { kind: "literal"; value: unknown; dataType: DataType }
  | { kind: "opaque" }
  | { kind: "unbound" };

export interface ChannelTypeError {
  /** The mark type the channel belongs to, e.g. "rect". */
  mark: string;
  /** The channel/prop name, e.g. "h". */
  channel: string;
  /** The channel's declared role: "size" | "pos" | "color" | "raw". */
  channelType: string;
  message: string;
}

interface SerializeTag {
  type: string;
  opts: Record<string, unknown>;
  channels?: Record<string, string | { type?: string }>;
  __combinator?: true;
  children?: unknown;
}

function readTag(value: unknown): SerializeTag | undefined {
  const tag = (value as any)?.__serialize;
  if (!tag || typeof tag.type !== "string") return undefined;
  return tag as SerializeTag;
}

function channelRole(spec: string | { type?: string }): string | undefined {
  return typeof spec === "string" ? spec : spec.type;
}

function jsType(value: unknown): DataType {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number" || t === "string" || t === "boolean") return t;
  if (t === "undefined") return "undefined";
  return "object";
}

/**
 * Infer a column-name → type map from the first row of inline data. Returns
 * `undefined` when no usable inline row is available (the caller treats that as
 * an opaque schema and skips field/string elaboration).
 */
export function inferRowSchema(data: unknown): RowSchema | undefined {
  if (!Array.isArray(data) || data.length === 0) return undefined;
  const row = data[0];
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    return undefined;
  }
  const schema: RowSchema = {};
  for (const key of Object.keys(row)) {
    schema[key] = jsType((row as Record<string, unknown>)[key]);
  }
  return schema;
}

/**
 * Elaborate a single channel argument into a field access, a literal, or an
 * opaque value, using the row schema (when known) to decide whether a string
 * names a column. Matches the runtime "string-in-schema → field, else literal"
 * rule; without a schema, bare strings stay opaque (they might be columns a
 * `derive` produced).
 */
export function elaborateChannelArg(
  arg: unknown,
  schema: RowSchema | undefined
): ElaboratedArg {
  if (arg === undefined) return { kind: "unbound" };
  if (isField(arg)) {
    return {
      kind: "field",
      name: arg.name,
      dataType: schema?.[arg.name] ?? "unknown",
    };
  }
  if (isLiteral(arg)) {
    return { kind: "literal", value: arg.value, dataType: jsType(arg.value) };
  }
  // `v(...)` / datum wrappers and function accessors are runtime-valued.
  if (isValue(arg as any) || typeof arg === "function")
    return { kind: "opaque" };
  if (typeof arg === "number" || typeof arg === "boolean") {
    return { kind: "literal", value: arg, dataType: jsType(arg) };
  }
  if (typeof arg === "string") {
    if (schema && arg in schema) {
      return { kind: "field", name: arg, dataType: schema[arg] };
    }
    if (schema) return { kind: "literal", value: arg, dataType: "string" };
    return { kind: "opaque" }; // no schema → can't tell field from literal
  }
  return { kind: "opaque" };
}

/** Typecheck one elaborated argument against its channel's expected type. */
function checkArg(
  markType: string,
  channel: string,
  role: string,
  elaborated: ElaboratedArg
): ChannelTypeError | undefined {
  const err = (message: string): ChannelTypeError => ({
    mark: markType,
    channel,
    channelType: role,
    message,
  });

  if (role === "size" || role === "pos") {
    if (elaborated.kind === "field" && elaborated.dataType !== "unknown") {
      if (elaborated.dataType !== "number") {
        return err(
          `channel "${channel}" (${role}) expects a numeric field, but "${elaborated.name}" is a ${elaborated.dataType} column`
        );
      }
    }
    if (elaborated.kind === "literal" && elaborated.dataType !== "number") {
      return err(
        `channel "${channel}" (${role}) expects a number, got ${elaborated.dataType} literal ${JSON.stringify(elaborated.value)}`
      );
    }
  } else if (role === "color") {
    // A bound field is mapped through a color scale (any column type is fine);
    // a literal color must be a string.
    if (elaborated.kind === "literal" && elaborated.dataType !== "string") {
      return err(
        `channel "${channel}" (color) expects a color string literal, got ${elaborated.dataType} ${JSON.stringify(elaborated.value)}`
      );
    }
  }
  // "raw" and field-bound color accept anything.
  return undefined;
}

/**
 * Elaborate and typecheck a single leaf mark's channel arguments against the
 * row schema. Returns any type errors (empty if clean or unclassifiable).
 */
export function typecheckMarkChannels(
  mark: unknown,
  schema: RowSchema | undefined
): ChannelTypeError[] {
  const tag = readTag(mark);
  if (!tag || !tag.channels) return [];
  const errors: ChannelTypeError[] = [];
  for (const [channel, spec] of Object.entries(tag.channels)) {
    const role = channelRole(spec);
    if (!role) continue;
    const elaborated = elaborateChannelArg(tag.opts[channel], schema);
    if (elaborated.kind === "unbound" || elaborated.kind === "opaque") continue;
    const error = checkArg(tag.type, channel, role, elaborated);
    if (error) errors.push(error);
  }
  return errors;
}

/** Recursively typecheck a mark tree's leaves (walking combinator children). */
function typecheckMarkTree(
  mark: unknown,
  schema: RowSchema | undefined
): ChannelTypeError[] {
  const tag = readTag(mark);
  if (!tag) return [];
  if (tag.__combinator) {
    const children = Array.isArray(tag.children) ? tag.children : [];
    return children.flatMap((c) => typecheckMarkTree(c, schema));
  }
  return typecheckMarkChannels(mark, schema);
}

/**
 * Typecheck a chart builder's channel arguments against its inline-data schema.
 *
 * The schema is taken from the first data row, *unless* an opaque operator
 * (a `derive`, or any operator the emitter can't tag) sits in the pipeline — in
 * which case the post-transform schema is unknown and field/string elaboration
 * is skipped. Returns all channel type errors found (empty when clean, when the
 * data isn't inline, or when the schema is opaque).
 */
export function typecheckChart(chart: unknown): ChannelTypeError[] {
  const c = chart as any;
  const data = c?.data;
  const operators: unknown[] = c?.operators ?? [];
  const finalMark = c?.finalMark;
  if (!finalMark) return [];

  // Any derive — or any operator the emitter can't tag (treated as derive on
  // the wire) — makes the downstream schema opaque.
  const opaquePipeline = operators.some((op) => {
    const tag = readTag(op);
    return !tag || tag.type === "derive";
  });

  const schema = opaquePipeline ? undefined : inferRowSchema(data);
  return typecheckMarkTree(finalMark, schema);
}
