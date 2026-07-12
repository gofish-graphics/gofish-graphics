/**
 * Explicit-schema Arrow table construction for the widget RPC transport
 * (issue #783).
 *
 * `Arrow.tableFromJSON`'s built-in type inference only handles flat,
 * JSON-primitive columns — it throws `Unable to infer Vector type from
 * input values` on a column whose value is a *list of objects*
 * (`list<struct>`), which is exactly the shape of a mark-fn's
 * `{__inputRef, datum}` sentinel when the ref's bound datum is a
 * multi-row bag (a `group(...)`'d ref — see `serializeMarkFnInput` in
 * `gofish-graphics/src/serialize/fromJSON.ts`). A single-row struct datum
 * happens to encode fine under `tableFromJSON`, which is why this only
 * surfaced for the multi-row case.
 *
 * Rather than special-case that one sentinel shape, this builds an
 * explicit Arrow type for every column (recursively, for nested lists and
 * structs) by walking the actual row values, then hands that type to
 * `Arrow.vectorFromArray` — which (unlike `tableFromJSON`) accepts an
 * explicit type for arbitrary nested shapes instead of trying to infer
 * one. This is generic RPC transport capability, not an `__inputRef`
 * special case: it fixes encoding for *any* row shape with a nested
 * array-of-objects column.
 *
 * Homogeneity assumption: rows within a nested bag (e.g. a group's row
 * bag) are assumed to share one schema — a reasonable assumption since
 * they come from one dataset. Missing keys are treated as null (ragged
 * but homogeneous data is fine); a key present with genuinely conflicting
 * types across rows (e.g. a string in one row, a number in another) is a
 * loud error naming the column and the conflicting types, not a silent
 * coercion.
 */

import * as Arrow from "apache-arrow";

type Row = Record<string, any>;

/** The handful of shapes a column's values can take, used to pick an Arrow type. */
type ValueKind =
  | "null"
  | "boolean"
  | "number"
  | "bigint"
  | "string"
  | "date"
  | "array"
  | "object";

function kindOf(value: any): ValueKind {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  const t = typeof value;
  if (t === "boolean" || t === "number" || t === "bigint" || t === "string") {
    return t as ValueKind;
  }
  if (t === "object") return "object";
  throw new Error(`Cannot encode value of type "${t}" for Arrow transport`);
}

/**
 * Infer an explicit Arrow type for a column (or a nested field/list-item)
 * from its actual values, recursing into arrays (→ List) and objects (→
 * Struct, unioning keys across all objects seen). Throws if the non-null
 * values disagree on kind (e.g. string vs number) — see module doc.
 */
function inferType(values: readonly any[], path: string): Arrow.DataType {
  const nonNull = values.filter((v) => v !== null && v !== undefined);
  if (nonNull.length === 0) {
    // No values to infer from (an all-null column, or an empty bag with no
    // rows to look at for element shape). `Null` round-trips a column of
    // all-null values fine, and an empty `List<Null>` still decodes back
    // to an empty list — there's nothing more specific to infer.
    return new Arrow.Null();
  }

  const kinds = new Set(nonNull.map(kindOf));
  if (kinds.size > 1) {
    throw new Error(
      `Arrow transport: column "${path}" has conflicting types across rows ` +
        `(${[...kinds].join(", ")}) — this bridge assumes rows sharing a ` +
        `column share a type; coerce or split the data before sending it ` +
        `across the RPC.`
    );
  }

  const kind = [...kinds][0];
  switch (kind) {
    case "array": {
      // The homogeneity assumption: every row's array in this column is a
      // bag from the same dataset, so its elements share one schema too.
      // Flatten all elements from all rows to infer one element type.
      const elements: any[] = ([] as any[]).concat(...(nonNull as any[][]));
      const itemType = inferType(elements, `${path}[]`);
      return new Arrow.List(new Arrow.Field("item", itemType, true));
    }
    case "object": {
      const keys = new Set<string>();
      for (const obj of nonNull) {
        for (const key of Object.keys(obj)) keys.add(key);
      }
      const fields = [...keys].map((key) => {
        const subValues = nonNull.map((obj) => (key in obj ? obj[key] : null));
        return new Arrow.Field(
          key,
          inferType(subValues, `${path}.${key}`),
          true
        );
      });
      return new Arrow.Struct(fields);
    }
    case "string":
      return new Arrow.Utf8();
    case "number":
      return new Arrow.Float64();
    case "boolean":
      return new Arrow.Bool();
    case "bigint":
      return new Arrow.Int64();
    case "date":
      return new Arrow.DateMillisecond();
    default:
      throw new Error(
        `Arrow transport: unsupported value kind "${kind}" for column "${path}"`
      );
  }
}

/**
 * Reshape a value to exactly match `type` before handing it to
 * `Arrow.vectorFromArray`. Needed because a plain object missing a key
 * (rather than carrying that key with an explicit `null`) isn't
 * automatically treated as null-for-that-field when nested inside a
 * List/Struct type — `vectorFromArray` only fills gaps it's told about, so
 * this walks the same List/Struct shape as `inferType` and fills them in.
 */
function normalizeForType(value: any, type: Arrow.DataType): any {
  if (value === null || value === undefined) return null;
  if (Arrow.DataType.isList(type)) {
    const itemType = (type.children[0] as Arrow.Field).type;
    return (value as any[]).map((v) => normalizeForType(v, itemType));
  }
  if (Arrow.DataType.isStruct(type)) {
    const out: Row = {};
    for (const field of type.children as Arrow.Field[]) {
      const raw = field.name in value ? value[field.name] : null;
      out[field.name] = normalizeForType(raw, field.type);
    }
    return out;
  }
  return value;
}

/**
 * Build an Arrow Table from plain-object rows, inferring an explicit type
 * per column (including nested list/struct columns) instead of relying on
 * `Arrow.tableFromJSON`'s inference, which can't handle a `list<struct>`
 * column at all. Always used uniformly — no fallback to `tableFromJSON` —
 * so there's one code path and one set of encoding rules to reason about.
 */
export function buildArrowTable(rows: readonly Row[]): Arrow.Table {
  const columnNames: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columnNames.push(key);
      }
    }
  }

  const vectors: Record<string, Arrow.Vector> = {};
  for (const name of columnNames) {
    const rawValues = rows.map((row) => (name in row ? row[name] : null));
    const type = inferType(rawValues, name);
    const values = rawValues.map((v) => normalizeForType(v, type));
    vectors[name] = Arrow.vectorFromArray(values, type as any);
  }
  return new Arrow.Table(vectors);
}
