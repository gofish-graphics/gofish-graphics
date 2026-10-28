import {
  getValue,
  getValueField,
  getValueOffset,
  isValue,
  MaybeValue,
} from "./ast/data";

/** Whether `v` is a promise or another thenable. */
export const isThenable = <T>(v: T | PromiseLike<T>): v is PromiseLike<T> =>
  v !== null &&
  (typeof v === "object" || typeof v === "function") &&
  typeof (v as PromiseLike<T>).then === "function";

/** Read a dev-gate flag from `globalThis.<name>` or `process.env.<name>` (truthy
 *  = on). Zero-cost when off; the single reader for the #39 dev gates
 *  (`GOFISH_SOLVER_CHECK`, `GOFISH_CONFLICT_CHECK`). */
export const envFlag = (name: string): boolean => {
  const g = globalThis as Record<string, unknown> & {
    process?: { env?: Record<string, string | undefined> };
  };
  return !!g[name] || !!g.process?.env?.[name];
};

export const lerp = (a: number, b: number, t: number): number => {
  return a + t * (b - a);
};

/** Confine `v` to `[lo, hi]`. */
export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/** A length in pixels as room: never below 0, and 0 when not finite. */
export const room = (px: number): number =>
  Number.isFinite(px) ? Math.max(0, px) : 0;

/** Euclidean modulo: `a % n` with the sign of `n`, so a negative `a` wraps
 *  around to the top of the range. */
export const mod = (a: number, n: number): number =>
  n === 0 ? 0 : ((a % n) + n) % n;

export const pairs = <T>(xs: T[]): [T, T][] => {
  const result: [T, T][] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    result.push([xs[i], xs[i + 1]]);
  }
  return result;
};

/**
 * Fold child extents into a bbox edge, ignoring non-finite entries. A child
 * can report an undefined extent on an axis it doesn't constrain (e.g. a
 * `spread` over POSITION children leaves its y-min unset); dropping those
 * keeps one `undefined` from poisoning the whole box via `Math.min(undefined)`.
 * Falls back to 0 when nothing is measurable.
 */
export const foldFinite = (
  vals: (number | undefined)[],
  f: (...n: number[]) => number
): number => {
  const finite = vals.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  return finite.length ? f(...finite) : 0;
};

// input is a value, an aesthetic literal, or undefined. behavior differs based on this
export const computeAesthetic = (
  input: MaybeValue<number> | undefined,
  scale: ((x: number) => number) | undefined,
  provided: number | undefined
): number | undefined => {
  // Every axis a data value is placed on has a position scale: a scope
  // solves one for any domain, a one-value domain included (#1107).
  if (isValue(input) && scale === undefined) {
    const field = getValueField(input);
    throw new Error(
      `[gofish] the value ${String(getValue(input))}` +
        (field === undefined ? "" : ` of field "${field}"`) +
        " was placed on an axis with no position scale: the axis has no " +
        "numeric interval to map, as when its values are not numbers."
    );
  }
  // A datum's pixel offset applies AFTER the scale mapping — "this data
  // position, plus pixels" (`datum(v).offset(px)`).
  return isValue(input)
    ? scale!(getValue(input)!) + getValueOffset(input)
    : (input ?? provided);
};

export const computeSize = (
  input: MaybeValue<number> | undefined,
  scaleFactor: number,
  size: number
): number => {
  return computeAesthetic(input, (x) => x * scaleFactor, size) as number;
};
