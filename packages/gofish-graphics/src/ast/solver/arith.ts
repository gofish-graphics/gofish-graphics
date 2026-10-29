// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Piecewise-Linear Values — /internals/core/pwl
// </gofish-wiki>

/**
 * The arithmetic a layout computation runs in: plain numbers (pixels at one
 * σ), or values in σ ({@link Pwl.Value}, a claim as a function of σ). The
 * placement solve (constraints/placementSolver.ts,
 * constraints/differenceGraph.ts) is written once over an `Arith`, so the
 * claim walk and layout run the same code: the claim walk in values, layout
 * in numbers.
 */
import * as Pwl from "./pwl";

export type Arith<T> = {
  zero: T;
  /** A σ-independent amount (a spacing, a literal pixel). */
  constant: (c: number) => T;
  add: (...xs: T[]) => T;
  /** `a − b`. */
  sub: (a: T, b: T) => T;
  scale: (k: number, x: T) => T;
  /** The upper envelope of `xs` (−∞ for none). */
  max: (xs: readonly T[]) => T;
  /** `−x`. */
  negate: (x: T) => T;
  /** `|x|`. */
  abs: (x: T) => T;
  /** Whether `a` and `b` agree within `tolerance` (for values, at every σ). */
  near: (a: T, b: T, tolerance: number) => boolean;
  /** Whether `a`, which `owner` asserts, agrees within `tolerance` with
   *  `b`, which `priorOwner` already implies: a constraint that
   *  over-determines a box. An arithmetic whose values layout has not
   *  measured yet (formulas, `Tape`) keeps the check for layout to make,
   *  at the σ it lays out at, and answers yes. */
  agree: (a: T, b: T, tolerance: number, owners: CheckOwners) => boolean;
  /** `x` in the box ledger's form (`BBox`), a value in σ: a number is a
   *  constant there. */
  toValue: (x: T) => Pwl.Value;
  /** A value the box ledger holds, in this arithmetic: the inverse of
   *  `toValue` (a number solve only writes constants there). */
  fromValue: (v: Pwl.Value) => T;
  /** `x` as a number for a message (a value at σ = 0, as `BBox` reports). */
  report: (x: T) => number;
};

/** Who asserts a value, and who implies the value it is checked against
 *  (`Arith.agree`). */
export type CheckOwners = { owner: string; priorOwner: string };

export const numbers: Arith<number> = {
  zero: 0,
  constant: (c) => c,
  add: (...xs) => {
    let sum = xs.length === 0 ? 0 : xs[0];
    for (let k = 1; k < xs.length; k++) sum += xs[k];
    return sum;
  },
  sub: (a, b) => a - b,
  scale: (k, x) => k * x,
  max: (xs) => {
    let m = -Infinity;
    for (const x of xs) m = Math.max(m, x);
    return m;
  },
  negate: (x) => -x,
  abs: Math.abs,
  near: (a, b, tolerance) => Math.abs(a - b) <= tolerance,
  agree: (a, b, tolerance) => Math.abs(a - b) <= tolerance,
  toValue: Pwl.constant,
  fromValue: (v) => Pwl.at(v, 0),
  report: (x) => x,
};

export const values: Arith<Pwl.Value> = {
  zero: Pwl.ZERO,
  constant: (c) => Pwl.affine(0, c),
  add: Pwl.add,
  sub: (a, b) => Pwl.add(a, Pwl.negate(b)),
  scale: Pwl.scale,
  max: Pwl.envelope,
  negate: Pwl.negate,
  abs: (x) => Pwl.envelope([x, Pwl.negate(x)]),
  near: Pwl.approxEqual,
  agree: (a, b, tolerance) => Pwl.approxEqual(a, b, tolerance),
  toValue: (x) => x,
  fromValue: (v) => v,
  report: (x) => Pwl.at(x, 0),
};
