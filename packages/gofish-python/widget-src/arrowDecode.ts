/**
 * The widget's Arrow decode: Arrow IPC bytes, as Python writes them
 * (`data_to_arrow_bytes` in `gofish/arrow_utils.py`), into the rows a chart
 * reads. The notebook widget decodes every chart tier and every callback
 * result with it, and the Python parity harness (`tests/harness/main.ts`)
 * decodes its tiers with the same function, so parity tests this transport.
 *
 * The decode attaches column types and leaves converting values to
 * `applySchema`, which every reader of the rows runs first, with its own
 * schema: a chart tier is chart data (`chart(rows, { schema })`), and a
 * callback's result goes through `applyLambdaTyped` (Serialize). Each
 * column's values go through one recursive conversion, {@link fromArrow},
 * chosen once per column from its Arrow type:
 *
 *  - null stays null (a float NaN stays NaN: GoFish never reads NaN as
 *    missing);
 *  - a timestamp with a time zone is an instant: it becomes epoch
 *    milliseconds, a number, and the rows carry the column's type,
 *    `HasCalendar` in the timestamp's `timezone`;
 *  - a naive timestamp (no time zone) or a date in a top-level column is a
 *    wall-clock value, not an instant: it becomes an ISO 8601 string without
 *    an offset ("2024-02-28T13:00:00", or "2024-02-28" for a date), and the
 *    rows carry `HasCalendar` in UTC. `applySchema` reads such a string in
 *    the zone of the column's type, so a chart that declares
 *    `Schema.time({ zone })` for the column reads it in that zone, exactly as
 *    it reads the same string from JS data, and a reader that declares
 *    nothing reads it in UTC;
 *  - the column types are attached with `Serialize.setColumnTypes`, the way a
 *    chart's `schema` attaches types, and a `schema` entry the reader
 *    declares for the column wins;
 *  - a list becomes a plain JS array (nested lists nested arrays), and a
 *    struct a plain object, each converting its children by their types. No
 *    schema names a value inside a list or a struct, so a time there is
 *    epoch milliseconds already, a naive timestamp or a date read in UTC
 *    (the zone a chart that declares none reads it in). A list of structs is
 *    a list of rows, so its array carries its own column types like a
 *    table's (`HasCalendar` in the timestamp's zone, or UTC);
 *  - a 64-bit integer (a `bigint`) becomes a JS number.
 */

import * as Arrow from "apache-arrow";
import { Serialize } from "gofish-graphics";

/** Decode base64 Arrow IPC streams, one per chart tier, into each tier's
 *  rows (see the module comment). This is the widget's `tier_arrow` trait
 *  and the parity harness's `tierArrow`. */
export function decodeTierRows(b64s: string[]): Record<string, any>[][] {
  return b64s.map(arrowB64ToRows);
}

/** Decode one base64 Arrow IPC stream into rows (see the module comment). */
export function arrowB64ToRows(b64: string): Record<string, any>[] {
  return arrowTableToRows(
    Arrow.tableFromIPC(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
  );
}

type Convert = (value: any) => any;

/** How to turn one value of Arrow type `type`, in a top-level column, into
 *  the JS value a row holds (see the module comment), or undefined when
 *  Arrow's value is already it. */
function fromArrow(type: Arrow.DataType): Convert | undefined {
  // Arrow hands back epoch ms; a naive timestamp counts the wall clock as if
  // it were UTC, so its UTC fields are the wall-clock fields.
  if (Arrow.DataType.isTimestamp(type) && !type.timezone) return wallClock;
  if (Arrow.DataType.isDate(type)) {
    return (v: Date | number) => wallClock(+v).split("T")[0];
  }
  return fromArrowNested(type);
}

/** How to turn one value of Arrow type `type`, inside a list or a struct,
 *  into JS (see the module comment), or undefined when Arrow's value is
 *  already it. */
function fromArrowNested(type: Arrow.DataType): Convert | undefined {
  // Epoch ms, a naive timestamp's read in UTC.
  if (Arrow.DataType.isTimestamp(type)) return undefined;
  if (Arrow.DataType.isDate(type)) return (v: Date | number) => +v;
  if (Arrow.DataType.isInt(type) && type.bitWidth === 64) return Number;
  if (Arrow.DataType.isList(type) || Arrow.DataType.isFixedSizeList(type)) {
    const itemType = type.children[0].type;
    const item = orNull(fromArrowNested(itemType));
    const types = Arrow.DataType.isStruct(itemType)
      ? columnTypes(itemType.children)
      : {};
    return Object.keys(types).length > 0
      ? (v: Iterable<any>) =>
          Serialize.setColumnTypes(
            Array.from(v, (x) => item(x)),
            types
          )
      : (v: Iterable<any>) => Array.from(v, (x) => item(x));
  }
  if (Arrow.DataType.isStruct(type)) {
    const fields = type.children.map(
      (f) => [f.name, orNull(fromArrowNested(f.type))] as const
    );
    return (v: any) => {
      const out: Record<string, any> = {};
      for (const [name, convert] of fields) out[name] = convert(v[name]);
      return out;
    };
  }
  return undefined;
}

/** The column types of a table's (or a list of structs') `fields`: each
 *  timestamp or date column is a time, `HasCalendar` in the timestamp's time
 *  zone, or UTC for a naive one or a date. */
function columnTypes(fields: Arrow.Field[]): Serialize.ColumnTypes {
  const types: Serialize.ColumnTypes = {};
  for (const { name, type } of fields) {
    if (Arrow.DataType.isTimestamp(type) || Arrow.DataType.isDate(type)) {
      const zone = (Arrow.DataType.isTimestamp(type) && type.timezone) || "UTC";
      types[name] = { HasCalendar: { zone } };
    }
  }
  return types;
}

/** Epoch ms `ms`, read in UTC, as an ISO 8601 date-time without an offset
 *  ("2024-02-28T13:00:00", with ".250" when it has milliseconds). */
function wallClock(ms: number): string {
  const s = new Date(ms).toISOString().slice(0, -1); // drop the "Z"
  return s.endsWith(".000") ? s.slice(0, -4) : s;
}

/** `convert`, with null (and undefined) passed through; identity if none. */
const orNull =
  (convert: Convert | undefined): Convert =>
  (v) =>
    v == null || convert === undefined ? v : convert(v);

/** A flat numeric column whose `toArray()` is its values as JS numbers. */
const isPlainNumeric = (type: Arrow.DataType): boolean =>
  Arrow.DataType.isFloat(type) ||
  (Arrow.DataType.isInt(type) && type.bitWidth <= 32);

/** Decode an Arrow table into rows (see the module comment). */
export function arrowTableToRows(table: Arrow.Table): Record<string, any>[] {
  const types = columnTypes(table.schema.fields);
  const columns = table.schema.fields.map((field, i) => {
    const column = table.getChildAt(i)!;
    const { type } = field;
    // Fast path: `toArray()` of a numeric column is its raw value buffer. It
    // ignores the validity bitmap (a null slot holds whatever bytes are
    // there), so it is read only when the column has no nulls.
    if (column.nullCount === 0 && isPlainNumeric(type)) {
      const values = column.toArray();
      return { name: field.name, at: (row: number) => values[row] };
    }
    const convert = orNull(fromArrow(type));
    return {
      name: field.name,
      at: (row: number) => convert(column.get(row)),
    };
  });

  const rows: Record<string, any>[] = [];
  for (let i = 0; i < table.numRows; i++) {
    const row: Record<string, any> = {};
    for (const col of columns) row[col.name] = col.at(i);
    rows.push(row);
  }
  return Object.keys(types).length > 0
    ? Serialize.setColumnTypes(rows, types)
    : rows;
}
