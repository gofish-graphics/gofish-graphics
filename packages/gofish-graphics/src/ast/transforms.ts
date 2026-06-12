import { bin as d3bin } from "d3-array";
import { MEASURE_PROVENANCE, type MeasureProvenance } from "./data";

type BinResult = { start: number; end: number; size: number; count: number };

function runBin<T extends Record<string, any>>(
  data: T[],
  field: keyof T & string,
  options?: { thresholds?: number | number[] }
): BinResult[] {
  const thresholds = options?.thresholds ?? 10;
  // d3 .thresholds() has separate overloads for `number` and `number[]`;
  // pass a typed value so the right overload is picked.
  const binnerBase = d3bin<T, number>().value((d) => d[field] as number);
  const binner = Array.isArray(thresholds)
    ? binnerBase.thresholds(thresholds as number[])
    : binnerBase.thresholds(thresholds as number);
  const bins = binner(data.filter((d) => d[field] != null));
  const result = bins
    .filter((b) => b.x0 !== undefined && b.x1 !== undefined)
    .map((b) => ({
      start: b.x0!,
      end: b.x1!,
      size: b.x1! - b.x0!,
      count: b.length,
    }));
  // Provenance: `start`/`end`/`size` are still in the SOURCE field's units
  // (e.g. "Beak Length (mm)"), not the literal column-name "start"; `count` is
  // a count. This rides the array (not each row) so it survives `derive(...)`,
  // letting channel inference unify a histogram's edges with the raw field's
  // axis instead of seeing a false measure conflict (see resolveMeasure).
  const provenance: MeasureProvenance = {
    start: field,
    end: field,
    size: field,
    count: "count",
  };
  Object.defineProperty(result, MEASURE_PROVENANCE, {
    value: provenance,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return result;
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
