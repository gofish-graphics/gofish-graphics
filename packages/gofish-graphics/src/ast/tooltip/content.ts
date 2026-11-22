// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki The Mark Factory — /internals/frontend/mark-factory
// </gofish-wiki>

/**
 * What a tooltip says about a mark (#1395): one row per field, a name and a
 * formatted value. INTERNAL: `.tooltip()` and `.tooltip(fields)` are the
 * public surface, and there is no format option.
 */
import { MARK_CHANNELS } from "../markChannels.generated";
import { inferColor, inferPos, inferRaw, inferSize } from "../channels";
import { getValue } from "../data";
import { GoFishNode } from "../_node";
import { GoFishRef } from "../_ref";

/** One row of a tooltip: the field's name and its formatted value. */
export type TooltipRow = readonly [name: string, value: string];

/** The mark a tooltip describes, as `.tooltip()` saw it: its rows and its
 *  wire (`{ type, opts }`), whose channel options name the fields it draws. */
export type TooltipMark = {
  rows: readonly unknown[];
  wire?: { type?: string; opts?: Record<string, unknown> };
};

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});
const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/**
 * A value as a tooltip shows it: a number with digit grouping and at most
 * two fraction digits (11902 is "11,902", 0.1300001 is "0.13"), a date by
 * its day, and its time when it has one (in UTC, as GoFish reads times by
 * default), anything else by `String`.
 */
export function formatValue(v: unknown): string {
  if (typeof v === "number")
    return Number.isFinite(v) ? numberFormat.format(v) : String(v);
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return String(v);
    const midnight =
      v.getUTCHours() === 0 &&
      v.getUTCMinutes() === 0 &&
      v.getUTCSeconds() === 0 &&
      v.getUTCMilliseconds() === 0;
    return (midnight ? dateFormat : dateTimeFormat).format(v);
  }
  return String(v);
}

/** The rows a mark was drawn from. A mark over marks (a line through refs)
 *  reads each ref's rows; a single row is a list of one. */
const rowsOf = (rows: readonly unknown[]): Record<string, unknown>[] =>
  rows.flatMap((r) =>
    r instanceof GoFishRef || r instanceof GoFishNode
      ? rowsOf(
          Array.isArray((r as { datum?: unknown }).datum)
            ? (r as { datum: unknown[] }).datum
            : [(r as { datum?: unknown }).datum]
        )
      : r !== null && typeof r === "object"
        ? [r as Record<string, unknown>]
        : []
  );

const same = (a: unknown, b: unknown): boolean =>
  a === b ||
  (a instanceof Date && b instanceof Date && a.getTime() === b.getTime()) ||
  (typeof a === "number" && typeof b === "number" && isNaN(a) && isNaN(b));

/** The value `field` has on every row, or `NONE` when the rows disagree or
 *  some row lacks it. */
const NONE = Symbol("none");
const singleValue = (
  rows: Record<string, unknown>[],
  field: string
): unknown => {
  if (rows.length === 0 || !rows.every((r) => field in r)) return NONE;
  const v = rows[0][field];
  return rows.every((r) => same(r[field], v)) ? v : NONE;
};

/** How each channel kind draws a field over the mark's rows: a size and an
 *  area sum them, a position averages them, a color or a raw value takes
 *  the first row's. */
const drawn = (
  kind: string,
  field: string,
  rows: Record<string, unknown>[]
): unknown => {
  const v =
    kind === "size" || kind === "area"
      ? inferSize(field as any, rows)
      : kind === "pos"
        ? inferPos(field as any, rows)
        : kind === "color"
          ? inferColor(field as any, rows)
          : kind === "raw"
            ? inferRaw(field as any, rows)
            : NONE;
  return getValue(v as any);
};

/** The fields a mark draws through a channel, each with its channel kind:
 *  the channel options of its wire whose value is a field name. */
const channelFields = (
  wire: TooltipMark["wire"],
  columns: ReadonlySet<string>
): Map<string, string> => {
  const channels =
    wire?.type !== undefined
      ? (MARK_CHANNELS as Record<string, Record<string, string>>)[wire.type]
      : undefined;
  const out = new Map<string, string>();
  if (channels === undefined || wire?.opts === undefined) return out;
  for (const [opt, value] of Object.entries(wire.opts)) {
    const kind = channels[opt];
    if (
      kind !== undefined &&
      kind !== "dims" &&
      typeof value === "string" &&
      columns.has(value) &&
      !out.has(value)
    )
      out.set(value, kind);
  }
  return out;
};

/**
 * A mark's tooltip rows. With no `fields`, one row per field with a single
 * value on the mark: every field all its rows agree on, and every field a
 * channel draws, with the value it draws (a stacked segment's summed count),
 * in the order of the data's columns. With `fields`, exactly those, in that
 * order. A field that is not a column of the mark's rows, or that has more
 * than one value and no channel draws it, is an error that names it.
 */
export function tooltipRows(
  mark: TooltipMark,
  fields?: readonly string[]
): TooltipRow[] {
  const rows = rowsOf(mark.rows);
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const r of rows)
    for (const k of Object.keys(r))
      if (!seen.has(k)) {
        seen.add(k);
        columns.push(k);
      }
  const channels = channelFields(mark.wire, seen);
  const valueOf = (field: string): unknown => {
    const kind = channels.get(field);
    return kind !== undefined
      ? drawn(kind, field, rows)
      : singleValue(rows, field);
  };
  if (fields === undefined)
    return columns.flatMap((f) => {
      const v = valueOf(f);
      return v === NONE || v === undefined
        ? []
        : [[f, formatValue(v)] as const];
    });
  return fields.map((f) => {
    if (!seen.has(f))
      throw new Error(
        `[gofish] .tooltip(): "${f}" is not a field of this mark's rows. ` +
          `Its fields are ${columns.map((c) => `"${c}"`).join(", ") || "none"}.`
      );
    const v = valueOf(f);
    if (v === NONE)
      throw new Error(
        `[gofish] .tooltip(): "${f}" has more than one value on this mark, ` +
          `and no channel of the mark draws it, so a tooltip row has no one ` +
          `value to show. Fields with one value here: ` +
          `${
            columns
              .filter((c) => valueOf(c) !== NONE)
              .map((c) => `"${c}"`)
              .join(", ") || "none"
          }.`
      );
    return [f, formatValue(v)] as const;
  });
}

/** The rows as the text of an SVG `<title>`: one `name: value` line each. */
export const tooltipText = (rows: readonly TooltipRow[]): string =>
  rows.map(([k, v]) => `${k}: ${v}`).join("\n");
