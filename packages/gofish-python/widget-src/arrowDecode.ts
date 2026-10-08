/**
 * The widget's Arrow decode: Arrow IPC bytes, as Python writes them
 * (`data_to_arrow_bytes` in `gofish/arrow_utils.py`), into the rows a chart
 * reads. The notebook widget decodes every chart tier and every derive
 * result with it, and the Python parity harness (`tests/harness/main.ts`)
 * decodes its tiers with the same function, so parity tests this transport.
 *
 * A timestamp or date column decodes to `Date`s, and the rows carry the
 * column's type, `HasCalendar` in the column's time zone (a timestamp's
 * `timezone`, else UTC), attached with `Serialize.setColumnTypes` the way a
 * chart's `schema` attaches types. The chart's `applySchema` then turns the
 * values into epoch milliseconds, as it does for any time column, and a
 * `schema` entry the chart declares for the column wins.
 *
 * 64-bit and 32-bit integers become JS numbers.
 */

import * as Arrow from "apache-arrow";
import { Serialize } from "gofish-graphics";

/** Decode Arrow IPC bytes into rows (see the module comment). */
export function arrowBytesToRows(bytes: Uint8Array): Record<string, any>[] {
  return arrowTableToRows(Arrow.tableFromIPC(bytes));
}

/** Decode an Arrow table into rows (see the module comment). */
export function arrowTableToRows(table: Arrow.Table): Record<string, any>[] {
  const types: Serialize.ColumnTypes = {};
  const columns = table.schema.fields.map((field, i) => {
    const column = table.getChildAt(i)!;
    const { type } = field;
    if (Arrow.DataType.isTimestamp(type) || Arrow.DataType.isDate(type)) {
      // A timestamp reads as epoch milliseconds, whatever its unit; a date
      // reads as a `Date` at UTC midnight.
      const zone = (Arrow.DataType.isTimestamp(type) && type.timezone) || "UTC";
      types[field.name] = { HasCalendar: { zone } };
      return {
        name: field.name,
        at: (row: number) => {
          const v = column.get(row);
          return v == null ? v : new Date(v);
        },
      };
    }
    const values = column.toArray();
    const typeStr = type ? type.toString() : "";
    const wideInt =
      typeStr.includes("Int64") ||
      typeStr.includes("UInt64") ||
      typeStr.includes("Int32") ||
      typeStr.includes("UInt32");
    return {
      name: field.name,
      at: (row: number) => {
        const v = values[row];
        if (typeof v === "bigint") return Number(v);
        return v !== null && v !== undefined && wideInt ? Number(v) : v;
      },
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
