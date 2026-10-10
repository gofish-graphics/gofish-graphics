import { bin as d3bin } from "d3-array";
import { columnType, setColumnTypes, type ColumnType } from "./schema";
import { columnQuantity, COUNT_COLUMN } from "./measure";

type BinResult = { start: number; end: number; size: number; count: number };

/** One bin: its `[start, end)` edges and the rows that fell in it. The single
 *  binning primitive — `bin()` below folds each bin to a count row, while
 *  `datumProjection.ts`'s `field(...).bin()` keeps the rows as a group. Rows
 *  with a null value at `field` are dropped; the default is 10 thresholds. */
export function binRows<T extends Record<string, any>>(
  field: keyof T & string,
  rows: T[],
  thresholds: number | number[] | undefined
): { start: number; end: number; rows: T[] }[] {
  const th = thresholds ?? 10;
  // d3 .thresholds() has separate overloads for `number` and `number[]`;
  // pass a typed value so the right overload is picked.
  const binnerBase = d3bin<T, number>().value((d) => d[field] as number);
  const binner = Array.isArray(th)
    ? binnerBase.thresholds(th as number[])
    : binnerBase.thresholds(th as number);
  return binner(rows.filter((d) => d[field] != null))
    .filter((b) => b.x0 !== undefined && b.x1 !== undefined)
    .map((b) => ({ start: b.x0!, end: b.x1!, rows: [...b] }));
}

function runBin<T extends Record<string, any>>(
  data: T[],
  field: keyof T & string,
  options?: { thresholds?: number | number[] }
): BinResult[] {
  const result = binRows(field, data, options?.thresholds).map((b) => ({
    start: b.start,
    end: b.end,
    size: b.end - b.start,
    count: b.rows.length,
  }));
  // Quantity and unit (`HasQuantity`, `HasUnit`): `start`/`end`/`size` are
  // amounts of the SOURCE column's quantity (e.g. "Beak Length (mm)", not
  // the column name "start"), in the source's declared unit, or else in its
  // unit variable, which the quantity names. So the edges title their axis
  // as the source does and unify with it. `count` is a count. The column
  // types ride the array (not each row) so they survive `derive(...)`.
  const source = columnType(data, field);
  const edge: ColumnType = {
    HasQuantity: { name: columnQuantity(field, source).name },
    ...(source?.HasUnit !== undefined ? { HasUnit: source.HasUnit } : {}),
  };
  return setColumnTypes(result, {
    start: edge,
    end: edge,
    size: edge,
    count: COUNT_COLUMN,
  });
}

export function bin<T extends Record<string, any>>(
  field: keyof T & string,
  options?: { thresholds?: number | number[] }
): (data: T[]) => BinResult[];
export function bin<T extends Record<string, any>>(
  data: T[],
  field: keyof T & string,
  options?: { thresholds?: number | number[] }
): BinResult[];
export function bin<T extends Record<string, any>>(
  dataOrField: T[] | (keyof T & string),
  fieldOrOptions?: (keyof T & string) | { thresholds?: number | number[] },
  options?: { thresholds?: number | number[] }
): BinResult[] | ((data: T[]) => BinResult[]) {
  if (typeof dataOrField === "string") {
    const field = dataOrField;
    const resolvedOptions = fieldOrOptions as
      | { thresholds?: number | number[] }
      | undefined;
    return (data: T[]) => runBin(data, field, resolvedOptions);
  }
  return runBin(dataOrField, fieldOrOptions as keyof T & string, options);
}
