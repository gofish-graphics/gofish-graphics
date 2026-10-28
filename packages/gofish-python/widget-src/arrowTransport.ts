/**
 * The widget's Arrow encode: a list, as JS holds it, into the Arrow table
 * that crosses the bridge to Python (`arrow_to_records` in
 * `gofish/arrow_utils.py` reads it back).
 *
 * A table is a list, so it is one Arrow column, `item`, whose type is the
 * type of the list's items: a struct for records (one field per key), a
 * scalar for values, a list for groups. Data flows as lists and nothing
 * inspects an item's shape: the item type is built from the values, by one
 * rule at every depth. Each value's kind picks its Arrow type: an array is a
 * List of its elements' type (the elements of every array in a column,
 * since a bag's rows come from one dataset), an object a Struct (the union
 * of the keys seen, a missing key null), a string Utf8, a boolean Bool, a
 * bigint Int64, and a ref (`Serialize.BridgeRef`, in a bridge call) the
 * extension type `gofish.ref` (see `inferField`). A number's type comes
 * from its column's declared type, never from its values: a column typed
 * in a unit read on a calendar (`Unit.time({ zone })`) is a millisecond timestamp in its zone, a column typed `HasInteger` (it arrived as integers) is
 * Int64, and any other number column is Float64, because JS has one number
 * type. A JS `Date` is an instant: a millisecond timestamp in its column's
 * zone, or UTC. The declared types are the ones the list carries
 * (`Serialize.getColumnTypes`), for the fields of its records, and the ones
 * each array carries, for the fields of the records inside it.
 *
 * `Arrow.tableFromJSON` is not used: its inference handles only flat
 * JSON-primitive columns and throws on a list of structs (#783), so every
 * type here is explicit and goes to `Arrow.vectorFromArray`.
 *
 * A key whose values have conflicting kinds (a string in one row, a number
 * in another) is a loud error naming the column and the kinds, not a silent
 * coercion.
 */

import * as Arrow from "apache-arrow";
import { Serialize } from "gofish-graphics";

type Row = Record<string, any>;

type ColumnType = Serialize.ColumnTypes[string];

/** The handful of shapes a column's values can take, used to pick an Arrow type. */
type ValueKind =
  | "null"
  | "ref"
  | "boolean"
  | "number"
  | "bigint"
  | "string"
  | "date"
  | "array"
  | "object";

function kindOf(value: any): ValueKind {
  if (value === null || value === undefined) return "null";
  if (value instanceof Serialize.BridgeRef) return "ref";
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
 * The Arrow type of `values` (a column, or the items of a list) from their
 * kinds and `type`, the column's declared type, recursing into arrays (→
 * List) and objects (→ Struct, whose keys have the declared types
 * `fields`). Throws if the non-null values disagree on kind (see the module
 * comment); `path` names the column in the message.
 */
function inferType(
  values: readonly any[],
  path: string,
  type?: ColumnType,
  fields?: Serialize.ColumnTypes
): Arrow.DataType {
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
      `Arrow transport: ${path ? `column "${path}"` : "the items"} ` +
        `${path ? "has" : "have"} conflicting types across rows ` +
        `(${[...kinds].join(", ")}) — this bridge assumes rows sharing a ` +
        `column share a type; coerce or split the data before sending it ` +
        `across the RPC.`
    );
  }

  const kind = [...kinds][0];
  switch (kind) {
    case "ref":
      return REF_STORAGE;
    case "array": {
      // The homogeneity assumption: every row's array in this column is a
      // bag from the same dataset, so its elements share one schema too.
      // Flatten all elements from all rows to infer one element type, with
      // the column types the bags carry.
      const elements: any[] = ([] as any[]).concat(...(nonNull as any[][]));
      const types: Serialize.ColumnTypes = Object.assign(
        {},
        ...nonNull.map((bag) => Serialize.getColumnTypes(bag) ?? {})
      );
      return new Arrow.List(
        inferField("item", elements, `${path}[]`, undefined, types)
      );
    }
    case "object": {
      const keys = new Set<string>();
      for (const obj of nonNull) {
        for (const key of Object.keys(obj)) keys.add(key);
      }
      const children = [...keys].map((key) => {
        const subValues = nonNull.map((obj) => (key in obj ? obj[key] : null));
        const name = path ? `${path}.${key}` : key;
        return inferField(key, subValues, name, fields?.[key]);
      });
      return new Arrow.Struct(children);
    }
    case "string":
      return new Arrow.Utf8();
    case "number":
      if (type?.HasUnit?.zone !== undefined) return instant(type);
      return type?.HasInteger ? new Arrow.Int64() : new Arrow.Float64();
    case "date":
      return instant(type);
    case "boolean":
      return new Arrow.Bool();
    case "bigint":
      return new Arrow.Int64();
    default:
      throw new Error(
        `Arrow transport: unsupported value kind "${kind}" for column "${path}"`
      );
  }
}

/**
 * The field named `name` of `values` (see {@link inferType}). A field of refs
 * is the extension type `gofish.ref`: its storage is `{index}`, a ref's index
 * in the call's refs, and the field's metadata names the type, which the
 * decode on either side reads (`arrowDecode.ts`, the `gofish.ref` type
 * registered in `gofish/arrow_utils.py`). So a ref is never read off a row's
 * keys, and no row is read as a ref.
 */
function inferField(
  name: string,
  values: readonly any[],
  path: string,
  type?: ColumnType,
  fields?: Serialize.ColumnTypes
): Arrow.Field {
  const dataType = inferType(values, path, type, fields);
  return new Arrow.Field(
    name,
    dataType,
    true,
    dataType === REF_STORAGE ? REF_EXTENSION : undefined
  );
}

/** The storage of the `gofish.ref` extension type, and the field metadata
 *  that names it (Arrow's extension-type convention). */
const REF_STORAGE = new Arrow.Struct([
  new Arrow.Field("index", new Arrow.Int64(), true),
]);
const REF_EXTENSION = new Map([
  ["ARROW:extension:name", "gofish.ref"],
  ["ARROW:extension:metadata", ""],
]);

/** An instant's Arrow type: a millisecond timestamp in the zone of its
 *  column's unit, or UTC. */
const instant = (type?: ColumnType): Arrow.DataType =>
  new Arrow.TimestampMillisecond(type?.HasUnit?.zone ?? "UTC");

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
  if (Arrow.DataType.isInt(type) && typeof value === "number") {
    return BigInt(value);
  }
  if (Arrow.DataType.isTimestamp(type) && value instanceof Date) {
    return value.getTime();
  }
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

/** The Arrow table of the list `items`: one column, `item`, of the items'
 *  type (see the module comment). */
export function buildArrowTable(items: readonly unknown[]): Arrow.Table {
  const field = inferField(
    "item",
    items,
    "",
    undefined,
    Serialize.getColumnTypes(items)
  );
  const values = items.map((v) => normalizeForType(v, field.type));
  return new Arrow.Table(new Arrow.Schema([field]), {
    item: Arrow.vectorFromArray(values, field.type as any),
  } as any);
}
