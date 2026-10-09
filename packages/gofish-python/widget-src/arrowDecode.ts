/**
 * The widget's Arrow decode: Arrow IPC bytes, as Python writes them
 * (`data_to_arrow_bytes` in `gofish/arrow_utils.py`), into the rows a chart
 * reads. The notebook widget decodes every chart tier and every derive result
 * with it, and the Python parity harness (`tests/harness/main.ts`) decodes its
 * tiers with the same function, so parity tests this transport.
 *
 * Each column's values go through one recursive conversion, {@link fromArrow},
 * chosen once per column from its Arrow type:
 *
 *  - null stays null (a float NaN stays NaN: GoFish never reads NaN as
 *    missing);
 *  - a timestamp with a time zone is an instant: it becomes epoch
 *    milliseconds, a number, and the rows carry the column's type,
 *    `HasCalendar` in the timestamp's `timezone`;
 *  - a naive timestamp (no time zone) or a date is a wall-clock value, not an
 *    instant: it becomes an ISO 8601 string without an offset
 *    ("2024-02-28T13:00:00", or "2024-02-28" for a date), and the rows carry
 *    `HasCalendar` in UTC. `applySchema` reads such a string in the zone of
 *    the column's type, so a chart that declares `Schema.time({ zone })` for
 *    the column reads it in that zone, exactly as it reads the same string
 *    from JS data, and a chart that declares nothing reads it in UTC;
 *  - the column types are attached with `Serialize.setColumnTypes`, the way a
 *    chart's `schema` attaches types, and a `schema` entry the chart
 *    declares for the column wins;
 *  - a list becomes a plain JS array (nested lists nested arrays), and a
 *    struct a plain object, each converting its children by their types;
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

/** How to turn one value of Arrow type `type` into the JS value a row holds
 *  (see the module comment), or undefined when Arrow's value is already it. */
function fromArrow(type: Arrow.DataType): Convert | undefined {
  if (Arrow.DataType.isTimestamp(type)) {
    // Arrow hands back epoch ms; a naive one counts the wall clock as if it
    // were UTC, so its UTC fields are the wall-clock fields.
    return type.timezone ? undefined : (ms: number) => wallClock(ms);
  }
  if (Arrow.DataType.isDate(type)) {
    return (v: Date | number) => new Date(+v).toISOString().split("T")[0];
  }
  if (Arrow.DataType.isInt(type) && type.bitWidth === 64) return Number;
  if (Arrow.DataType.isList(type) || Arrow.DataType.isFixedSizeList(type)) {
    const item = orNull(fromArrow(type.children[0].type));
    return (v: Iterable<any>) => Array.from(v, (x) => item(x));
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
  const types: Serialize.ColumnTypes = {};
  const columns = table.schema.fields.map((field, i) => {
    const column = table.getChildAt(i)!;
    const { type } = field;
    if (Arrow.DataType.isTimestamp(type) || Arrow.DataType.isDate(type)) {
      const zone = (Arrow.DataType.isTimestamp(type) && type.timezone) || "UTC";
      types[field.name] = { HasCalendar: { zone } };
    }
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
