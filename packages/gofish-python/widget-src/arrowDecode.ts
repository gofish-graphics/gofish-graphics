/**
 * The widget's Arrow decode: Arrow IPC bytes, as Python writes them
 * (`data_to_arrow_bytes` in `gofish/arrow_utils.py`), into the list a chart
 * reads. The notebook widget decodes every table and every callback
 * result with it, and the Python parity harness (`tests/harness/main.ts`)
 * decodes its tables with the same function, so parity tests this transport.
 *
 * A table is a list, one Arrow column of its items (see `arrowTransport.ts`),
 * so the decode is always the same: column 0 is the list. Its values go
 * through one recursive conversion, chosen once per Arrow type:
 *
 *  - null stays null (a float NaN stays NaN: GoFish never reads NaN as
 *    missing);
 *  - a struct becomes a plain object, each field converting by its own type;
 *    a list of structs is a list of rows, whose fields are its columns, so
 *    the list carries their column types (attached with
 *    `Serialize.setColumnTypes`, the way a chart's `schema` attaches types):
 *    a timestamp or a date field is a time, `HasCalendar` in the timestamp's
 *    `timezone` or in UTC, and an integer field is `HasInteger`, so the
 *    encode sends it back as integers. The list's records are read a field
 *    at a time, from the struct's child vectors;
 *  - a list becomes a plain JS array (nested lists nested arrays);
 *  - a timestamp is epoch milliseconds, a number (a naive timestamp counts
 *    its wall clock as UTC), and a date the epoch milliseconds of its UTC
 *    midnight;
 *  - a 64-bit integer (a `bigint`) becomes a JS number.
 *
 * One exception, for the fields of the table's own records, which a chart's
 * schema can name: a naive timestamp (no time zone) or a date there is a
 * wall-clock value, not an instant, so it becomes an ISO 8601 string without
 * an offset ("2024-02-28T13:00:00", or "2024-02-28" for a date), typed
 * `HasCalendar` in UTC. `applySchema` reads such a string in the zone of the
 * column's type, so a chart that declares `Schema.time({ zone })` for the
 * column reads it in that zone, exactly as it reads the same string from JS
 * data, and a reader that declares nothing reads it in UTC.
 *
 * The decode attaches types and leaves converting values to `applySchema`,
 * which every reader of the rows runs first, with its own schema: a table is
 * chart data (`chart(rows, { schema })`), and a callback's result goes
 * through `applySchema` where the deserializer reads it (an accessor's
 * values, a `derive`'s rows with its `schema`). A `schema` entry the reader
 * declares for a column wins over the decode's type.
 */

import * as Arrow from "apache-arrow";
import { Schema, Serialize } from "gofish-graphics";

/** Decode base64 Arrow IPC streams, one per table id, into each table's
 *  list (see the module comment): a shipped document's `tables`, and those
 *  of a bridge call's reply. */
export function decodeTables(
  b64s: Record<string, string>
): Record<string, unknown[]> {
  return Object.fromEntries(
    Object.entries(b64s).map(([id, b64]) => [id, arrowB64ToRows(b64)])
  );
}

/** Decode one base64 Arrow IPC stream into its list (see the module
 *  comment). */
export function arrowB64ToRows(b64: string): unknown[] {
  return arrowTableToRows(
    Arrow.tableFromIPC(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
  );
}

/** Decode an Arrow table into the list it holds, its column 0 (see the
 *  module comment). */
export function arrowTableToRows(table: Arrow.Table): unknown[] {
  if (table.numCols !== 1) {
    throw new Error(
      `Arrow transport: a table is one column of its items, but this one ` +
        `has ${table.numCols} (${table.schema.fields.map((f) => f.name)})`
    );
  }
  return listOf(table.getChildAt(0)!, fromArrowField);
}

type Convert = (value: any) => any;

/** The items of `vector` as a JS array. A struct's items are read a field
 *  at a time from its child vectors, each field converted by `field` of its
 *  type, and the array carries the fields' column types. */
function listOf(
  vector: Arrow.Vector,
  field: (type: Arrow.DataType) => Convert | undefined
): unknown[] {
  const { type, length } = vector;
  if (!Arrow.DataType.isStruct(type)) {
    const convert = orNull(fromArrow(type));
    return Array.from({ length }, (_, i) => convert(vector.get(i)));
  }
  const columns = type.children.map((f, j) => {
    const child = vector.getChildAt(j)!;
    // Fast path: `toArray()` of a numeric column is its raw value buffer. It
    // ignores the validity bitmap (a null slot holds whatever bytes are
    // there), so it is read only when the column has no nulls.
    if (child.nullCount === 0 && isPlainNumeric(f.type)) {
      const values = child.toArray();
      return { name: f.name, at: (i: number) => values[i] };
    }
    const convert = orNull(field(f.type));
    return { name: f.name, at: (i: number) => convert(child.get(i)) };
  });
  const rows: (Record<string, any> | null)[] = [];
  const nullable = vector.nullCount > 0;
  for (let i = 0; i < length; i++) {
    if (nullable && !vector.isValid(i)) {
      rows.push(null);
      continue;
    }
    const row: Record<string, any> = {};
    for (const col of columns) row[col.name] = col.at(i);
    rows.push(row);
  }
  const types = columnTypes(type.children);
  return Object.keys(types).length > 0
    ? Serialize.setColumnTypes(rows, types)
    : rows;
}

/** How to turn one value of a table record's field of Arrow type `type`
 *  into JS (see the module comment's exception), or undefined when Arrow's
 *  value is already it. */
function fromArrowField(type: Arrow.DataType): Convert | undefined {
  // Arrow hands back epoch ms; a naive timestamp counts the wall clock as if
  // it were UTC, so its UTC fields are the wall-clock fields.
  if (Arrow.DataType.isTimestamp(type) && !type.timezone) return wallClock;
  if (Arrow.DataType.isDate(type)) {
    return (v: Date | number) => wallClock(+v).split("T")[0];
  }
  return fromArrow(type);
}

/** How to turn one value of Arrow type `type` into JS (see the module
 *  comment), or undefined when Arrow's value is already it. */
function fromArrow(type: Arrow.DataType): Convert | undefined {
  // Epoch ms, a naive timestamp's read in UTC.
  if (Arrow.DataType.isTimestamp(type)) return undefined;
  if (Arrow.DataType.isDate(type)) return (v: Date | number) => +v;
  if (Arrow.DataType.isInt(type) && type.bitWidth === 64) return Number;
  if (Arrow.DataType.isList(type) || Arrow.DataType.isFixedSizeList(type)) {
    return (v: Arrow.Vector) => listOf(v, fromArrow);
  }
  if (Arrow.DataType.isStruct(type)) {
    const fields = type.children.map(
      (f) => [f.name, orNull(fromArrow(f.type))] as const
    );
    return (v: any) => {
      const out: Record<string, any> = {};
      for (const [name, convert] of fields) out[name] = convert(v[name]);
      return out;
    };
  }
  return undefined;
}

/** The column types of a list of records' `fields`: each timestamp or date
 *  field is a time, `Schema.time({ zone })`'s type in the timestamp's time
 *  zone, or UTC for a naive one or a date, and each integer field is
 *  `HasInteger`. */
function columnTypes(fields: Arrow.Field[]): Serialize.ColumnTypes {
  const types: Serialize.ColumnTypes = {};
  for (const { name, type } of fields) {
    if (Arrow.DataType.isTimestamp(type) || Arrow.DataType.isDate(type)) {
      const zone = (Arrow.DataType.isTimestamp(type) && type.timezone) || "UTC";
      types[name] = Schema.time({ zone }).type;
    } else if (Arrow.DataType.isInt(type)) {
      types[name] = { HasInteger: {} };
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
