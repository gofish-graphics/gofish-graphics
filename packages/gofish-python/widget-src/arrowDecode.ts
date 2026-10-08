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
 *  - a timestamp or a date becomes epoch milliseconds, a number, and the rows
 *    carry the column's type, `HasCalendar` in the column's time zone (a
 *    timestamp's `timezone`, else UTC), attached with
 *    `Serialize.setColumnTypes` the way a chart's `schema` attaches types. A
 *    `schema` entry the chart declares for the column wins;
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
  if (Arrow.DataType.isTimestamp(type)) return undefined; // epoch ms already
  if (Arrow.DataType.isDate(type)) return (v: Date) => v.getTime();
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
