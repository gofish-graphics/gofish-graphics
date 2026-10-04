// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

/**
 * Non-finite numbers in the IR.
 *
 * JSON has no `Infinity`, `-Infinity` or `NaN`: `JSON.stringify` writes them
 * as `null`, and Python's `json.dumps` writes bare `Infinity`, which
 * `JSON.parse` rejects. So an IR document carries each non-finite number as
 * a tagged object, the way MongoDB Extended JSON does:
 *
 *     Infinity   → { "$numberDouble": "Infinity" }
 *     -Infinity  → { "$numberDouble": "-Infinity" }
 *     NaN        → { "$numberDouble": "NaN" }
 *
 * The tag is valid wherever a number is (an option, a channel value, a data
 * row), so one encoding covers every number field with no per-field rule. A
 * writer encodes the whole document as it makes it ({@link encodeNonFinite}:
 * JS `toJSON`, Python `to_ir()`), and a reader decodes the whole document
 * where it receives it, before rebuilding a chart ({@link decodeNonFinite},
 * through gofish-graphics' `Serialize.readIR`). The validator accepts
 * `"Infinity"` and `"-Infinity"` wherever it expects a number and rejects
 * `"NaN"` there loudly: a NaN option is always a bug. A NaN inside data rows
 * is untyped and passes through.
 */

/** The tag's key, from MongoDB Extended JSON's canonical form. */
const NON_FINITE_KEY = "$numberDouble";

type NonFiniteSpelling = "Infinity" | "-Infinity" | "NaN";

/** A non-finite number as the IR carries it. */
export type NonFiniteNumberIR = { $numberDouble: NonFiniteSpelling };

const SPELLINGS: Record<NonFiniteSpelling, number> = {
  Infinity: Infinity,
  "-Infinity": -Infinity,
  NaN: NaN,
};

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** Is `v` the tagged form of a non-finite number? */
export function isNonFiniteNumberIR(v: unknown): v is NonFiniteNumberIR {
  if (v === null || typeof v !== "object" || !(NON_FINITE_KEY in v))
    return false;
  if (!isPlainObject(v) || Object.keys(v).length !== 1) return false;
  return Object.prototype.hasOwnProperty.call(
    SPELLINGS,
    v[NON_FINITE_KEY] as string
  );
}

/** Is `v` the tagged form of `Infinity` or `-Infinity` (not `NaN`)? */
export function isTaggedInfinity(v: unknown): v is NonFiniteNumberIR {
  return isNonFiniteNumberIR(v) && v[NON_FINITE_KEY] !== "NaN";
}

/** The tagged form of a non-finite number; a finite number is unchanged. */
function encodeNumber(n: number): number | NonFiniteNumberIR {
  if (Number.isFinite(n)) return n;
  return {
    [NON_FINITE_KEY]: Number.isNaN(n)
      ? "NaN"
      : n > 0
        ? "Infinity"
        : "-Infinity",
  } as NonFiniteNumberIR;
}

/**
 * Encode every non-finite number in a JSON-shaped value (plain objects,
 * arrays, primitives). Returns a new value where anything changed and the
 * same value otherwise.
 */
export function encodeNonFinite<T>(value: T): T {
  return walk(value, (v) =>
    typeof v === "number" && !Number.isFinite(v) ? encodeNumber(v) : undefined
  ) as T;
}

/** Decode every tagged non-finite number in a JSON-shaped value back to a
 *  number. The inverse of {@link encodeNonFinite}. */
export function decodeNonFinite<T>(value: T): T {
  return walk(value, (v) =>
    isNonFiniteNumberIR(v) ? SPELLINGS[v[NON_FINITE_KEY]] : undefined
  ) as T;
}

/** Rebuild `value` bottom-up, replacing any node `swap` answers for. Shares
 *  every subtree that did not change. */
function walk(value: unknown, swap: (v: unknown) => unknown): unknown {
  const swapped = swap(value);
  if (swapped !== undefined) return swapped;
  if (Array.isArray(value)) {
    let out: unknown[] | undefined;
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      const next = walk(item, swap);
      if (next !== item) (out ??= value.slice())[i] = next;
    }
    return out ?? value;
  }
  if (isPlainObject(value)) {
    let out: Record<string, unknown> | undefined;
    for (const k in value) {
      if (!Object.prototype.hasOwnProperty.call(value, k)) continue;
      const item = value[k];
      const next = walk(item, swap);
      if (next !== item) (out ??= { ...value })[k] = next;
    }
    return out ?? value;
  }
  return value;
}
