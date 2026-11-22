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
import { formatter } from "../calendar";
import { columnType } from "../schema";

/** One row of a tooltip: the field's name and its formatted value. */
export type TooltipRow = readonly [name: string, value: string];

/** The mark a tooltip describes, as `.tooltip()` saw it: its rows and its
 *  wire (`{ type, opts }`), whose channel options name the fields it draws. */
export type TooltipMark = {
  rows: readonly unknown[];
  wire?: { type?: string; opts?: Record<string, unknown> };
};

// Digits are grouped from five on (`min2`): 11902 is "11,902", but a
// four-digit number such as a year takes no separator (2018 is "2018").
const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  useGrouping: "min2",
});
// Below 1, two fraction digits lose the value (0.0119 would read "0.01"),
// so a small number keeps three significant digits instead.
const smallNumberFormat = new Intl.NumberFormat("en-US", {
  maximumSignificantDigits: 3,
  useGrouping: "min2",
});
const DATE: Intl.DateTimeFormatOptions = { dateStyle: "medium" };
const DATE_TIME: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};
const CLOCK: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
};

/** Whether `v` is midnight on the calendar of `zone`. */
const isMidnight = (v: Date, zone: string): boolean =>
  v.getUTCMilliseconds() === 0 &&
  formatter("tooltipClock", CLOCK, zone)
    .formatToParts(v)
    .every((p) => p.type === "literal" || Number(p.value) === 0);

/**
 * A value as a tooltip shows it: a number with digit grouping from five
 * digits on and at most two fraction digits (11902 is "11,902", 2018 is
 * "2018"), or three significant digits when
 * it is below 1 (0.1300001 is "0.13", 0.0119 is "0.0119"), a date by
 * its day, and its time when it has one, on the calendar of `zone`, the
 * zone of its column's `Unit.time` (UTC when the column has none), as an
 * axis reads it; a number in a column with a zone is an instant, epoch
 * milliseconds; anything else by `String`.
 */
export function formatValue(v: unknown, zone?: string): string {
  // A number in a column of instants (one with a zone) is epoch ms.
  if (typeof v === "number" && zone !== undefined && Number.isFinite(v))
    v = new Date(v);
  if (typeof v === "number")
    return !Number.isFinite(v)
      ? String(v)
      : (Math.abs(v) < 1 ? smallNumberFormat : numberFormat).format(v);
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return String(v);
    const on = zone ?? "UTC";
    return isMidnight(v, on)
      ? formatter("tooltipDate", DATE, on).format(v)
      : formatter("tooltipDateTime", DATE_TIME, on).format(v);
  }
  return String(v);
}

/** The rows a datum stands for, as a list: the datum itself when it is a
 *  list, none for no datum, else a list of one. A mark's key, its box and
 *  its focus candidate all read a mark's rows this way. */
export const rowsOfDatum = (datum: unknown): unknown[] =>
  Array.isArray(datum) ? datum : datum === undefined ? [] : [datum];

/** The records a mark was drawn from. A mark over marks (a line through
 *  refs) reads each ref's rows. */
const rowsOf = (rows: readonly unknown[]): Record<string, unknown>[] =>
  rows.flatMap((r) =>
    r instanceof GoFishRef || r instanceof GoFishNode
      ? rowsOf(rowsOfDatum((r as { datum?: unknown }).datum))
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

/**
 * The marks whose position and size channels read each row, not one value
 * for the mark: a `line` and a `ribbon` in shape form draw a path through
 * their rows (their descriptors: "each row's x"). On them only the color
 * channels draw one value. TODO(#1395): this is a list here because the
 * descriptor table does not say it; the right fix is a channel `infer` kind
 * for a per-row position, which `MARK_CHANNELS` would carry.
 */
const PER_ROW_MARKS = new Set(["line", "ribbon"]);

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
      !(PER_ROW_MARKS.has(wire.type!) && kind !== "color") &&
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
 *
 * `perRow` is for a mark drawn through its rows (`GoFishNode.throughRows`),
 * whose box shows one row: a listed field need only be a column of its
 * rows, and the listed fields with more than one value on the whole mark
 * are left out (its `<title>` describes the whole line).
 */
export function tooltipRows(
  mark: TooltipMark,
  fields?: readonly string[],
  perRow = false
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
  // A time column's zone is on the rows' column types (`Unit.time`).
  const zoneOf = (field: string): string | undefined =>
    columnType(mark.rows, field)?.HasUnit?.zone;
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
        : [[f, formatValue(v, zoneOf(f))] as const];
    });
  return fields.flatMap((f) => {
    if (!seen.has(f))
      throw new Error(
        `[gofish] .tooltip(): "${f}" is not a field of this mark's rows. ` +
          `Its fields are ${columns.map((c) => `"${c}"`).join(", ") || "none"}.`
      );
    const v = valueOf(f);
    if (v === NONE && perRow) return [];
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
    return [[f, formatValue(v, zoneOf(f))] as const];
  });
}

/**
 * The tooltip rows of one row of a mark drawn through its rows (the
 * focused row of a line), `mark.rows` being that one row: as
 * {@link tooltipRows}, less the listed fields the row lacks. A listed name
 * need only be a column of some row of the mark, which the render checked,
 * so a row without it leaves it out of its box.
 */
export function rowTooltipRows(
  mark: TooltipMark,
  fields?: readonly string[]
): TooltipRow[] {
  if (fields === undefined) return tooltipRows(mark);
  const rows = rowsOf(mark.rows);
  return tooltipRows(
    mark,
    fields.filter((f) => rows.some((r) => f in r))
  );
}

/** The rows as the text of an SVG `<title>`: one `name: value` line each. */
export const tooltipText = (rows: readonly TooltipRow[]): string =>
  rows.map(([k, v]) => `${k}: ${v}`).join("\n");
