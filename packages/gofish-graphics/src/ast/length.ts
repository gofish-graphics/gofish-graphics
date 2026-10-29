// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// Lengths (#1176 step 6): a size or a gap given as pixels (a number), as a
// percent of the room it is laid out in, or as an `fr` weight, a share of
// the nearest σ-scope.

import * as Pwl from "./solver/pwl";
import { Frontend } from "gofish-ir";

/** The canvas an axis the render gives no size is laid out against: a data
 *  σ is solved in it (`layout` in gofish.tsx), and a percent there is a
 *  percent of it. */
export const DEFAULT_CANVAS_SIZE = 400;

/**
 * A length that is not plain pixels: a percent of a room plus pixels, or an
 * `fr` weight. Its wire form is its own fields: `{ type: "length",
 * percent, px }` or `{ type: "length", fr }`, which Python builds as a dict
 * and the engine reads as it is ({@link isLength}).
 */
export class LengthValue {
  public readonly type = "length" as const;
  constructor(
    /** A percent of the room the length is laid out in. */
    public readonly percent?: number,
    /** Pixels added to the percent (`percent(n).offset(px)`). */
    public readonly px?: number,
    /** A weight: `fr` shares of the σ of the nearest scope. */
    public readonly fr?: number
  ) {}

  /** This percent plus `px` pixels (CSS `calc(30% + 10px)`). An `fr`
   *  weight takes no offset. */
  offset(px: number): LengthValue {
    if (this.fr !== undefined)
      throw new Error(
        `fr(${this.fr}).offset(...): an fr weight takes no offset.`
      );
    if (!Number.isFinite(px))
      throw new Error(
        `percent(...).offset(px): px must be a finite number, got ${px}.`
      );
    return new LengthValue(this.percent, (this.px ?? 0) + px);
  }

  toJSON(): Length {
    return this.fr !== undefined
      ? { type: "length", fr: this.fr }
      : this.px === undefined || this.px === 0
        ? { type: "length", percent: this.percent! }
        : { type: "length", percent: this.percent!, px: this.px };
  }
}

/** The wire form of a {@link LengthValue}. */
export type Length =
  | { type: "length"; percent: number; px?: number }
  | { type: "length"; fr: number };

/** `n` percent of the room the length is laid out in. */
export const percent = (n: number): LengthValue => {
  if (!Number.isFinite(n))
    throw new Error(`percent(n): n must be a finite number, got ${n}.`);
  return new LengthValue(n);
};

/** A weight of `n` shares of the nearest scope's room: a category band is
 *  `fr(1)`. */
export const fr = (n: number): LengthValue => {
  if (!(Number.isFinite(n) && n >= 0))
    throw new Error(`fr(n): n must be a finite number, 0 or more, got ${n}.`);
  return new LengthValue(undefined, undefined, n);
};

/** Whether `v` is a length (a {@link LengthValue}, or its wire form). */
export const isLength = (v: unknown): v is Length | LengthValue =>
  typeof v === "object" &&
  v !== null &&
  (v as { type?: unknown }).type === "length";

/** Whether the length `v` is an `fr` weight. */
export const isFr = (v: Length | LengthValue): boolean =>
  (v as { fr?: number }).fr !== undefined;

/** `v` as it is written: `percent(30)`, `percent(30).offset(10)`,
 *  `fr(2)`. */
export const printLength = (v: Length | LengthValue): string => {
  const {
    percent: p,
    px,
    fr: k,
  } = v as {
    percent?: number;
    px?: number;
    fr?: number;
  };
  if (k !== undefined) return `fr(${k})`;
  return px === undefined || px === 0
    ? `percent(${p})`
    : `percent(${p}).offset(${px})`;
};

/**
 * The length `v` laid out in `room` (a value in σ: a constant at a scope
 * whose room is known, `kσ` in a band), and the σ of its scope for `fr`:
 * `ρ·room + px` for a percent, `kσ` for an `fr` weight. A number is its
 * pixels.
 */
export const lengthIn = (
  v: number | Length | LengthValue,
  room: () => Pwl.Value
): Pwl.Value => {
  if (typeof v === "number") return Pwl.constant(v);
  const {
    percent: p,
    px,
    fr: k,
  } = v as {
    percent?: number;
    px?: number;
    fr?: number;
  };
  if (k !== undefined) return Pwl.affine(k, 0);
  return Pwl.addConstant(Pwl.scale((p ?? 0) / 100, room()), px ?? 0);
};

/** Per axis, a length or none. */
export type LengthPair = [
  LengthValue | Length | undefined,
  LengthValue | Length | undefined,
];

/**
 * Take a construct's own `w`/`h` lengths out of its options (`w:
 * percent(30)`, `h: fr(2)`), leaving pixels and data values where they
 * are: per axis, the length taken, or undefined. The construct gives them
 * to its node ({@link bindLengths}).
 */
export const takeLengths = (dims: Record<string, unknown>): LengthPair => {
  const taken: LengthPair = [undefined, undefined];
  (["w", "h"] as const).forEach((k, axis) => {
    const v = dims[k];
    if (!isLength(v)) return;
    taken[axis] = v;
    delete dims[k];
  });
  return taken;
};

/** A node a construct gives its own lengths to: see `GoFishNode.ownLengths`
 *  and `GoFishNode.lengthPx`. */
type LengthNode = {
  ownLengths?: LengthPair;
  lengthPx(axis: 0 | 1): number | undefined;
};

/**
 * Give `node` the lengths `taken` from its options ({@link takeLengths}):
 * its size on such an axis (`dims[axis].size`) is the length laid out in
 * its room, in pixels where that is known before the layer solve, and none
 * where the length is a share of its scope (an `fr` weight, which its claim
 * is instead). It is read on demand, since the room is known only once the
 * node is in its tree.
 */
export const bindLengths = (
  node: LengthNode,
  dims: { size?: unknown }[],
  taken: LengthPair
): void => {
  if (taken[0] === undefined && taken[1] === undefined) return;
  node.ownLengths = taken;
  ([0, 1] as const).forEach((axis) => {
    if (taken[axis] === undefined) return;
    Object.defineProperty(dims[axis], "size", {
      get: () => node.lengthPx(axis),
      enumerable: true,
      configurable: true,
    });
  });
};

/** Whether a field of this declared type takes a length: its type names the
 *  `Length` option type, alone or in a union, a tuple or a list. */
const takesLength = (type: Frontend.FieldType): boolean => {
  switch (type.kind) {
    case "ref":
      return type.name === "Length";
    case "union":
      return type.options.some(takesLength);
    case "tuple":
      return type.items.some(takesLength);
    case "array":
      return takesLength(type.items);
    default:
      return false;
  }
};

/** The length `v` holds, at its top or as an item of a list (a table's
 *  `[x, y]` spacing), if any. */
const heldLength = (v: unknown): Length | LengthValue | undefined =>
  isLength(v)
    ? v
    : Array.isArray(v)
      ? (v.find(isLength) as Length | LengthValue | undefined)
      : undefined;

/**
 * Check that each option of a construct that holds a length is one its
 * descriptor declares as taking one (`t.ref("Length")` in gofish-ir's
 * descriptor table, the one list of the options that do): a length anywhere
 * else is an error, never dropped. `fields` are the construct's declared
 * fields (`Frontend.acceptedFields`); a construct with none has no wire form,
 * so it is not checked here.
 */
export function checkLengths(
  fields: Readonly<Record<string, { type: Frontend.FieldType }>> | undefined,
  what: string,
  opts: Record<string, unknown> | undefined
): void {
  if (fields === undefined || opts === undefined) return;
  for (const [key, v] of Object.entries(opts)) {
    const len = heldLength(v);
    if (len === undefined) continue;
    if (!Object.hasOwn(fields, key) || !takesLength(fields[key].type))
      rejectLength(`${what}'s ${key}`, len);
  }
}

/** A length where only pixels are accepted, named for its message: `what`
 *  takes no percent or fr. */
export const rejectLength = (what: string, v: unknown): void => {
  if (isLength(v))
    throw new Error(
      `${what} takes pixels, not ${printLength(v)}: a percent or fr ` +
        `length is not accepted there.`
    );
};
