/**
 * Expressions a spec holds that the engine computes once per group: a
 * function value, and (with `field(...).reduce`) a value or a function made
 * from each group's rows.
 *
 * A spec is written once, but a mark is drawn once for each group of rows,
 * so a value in a spec stands for "this value, computed for each group".
 * The two kinds a channel takes are the leaves:
 *
 * - a **value expression**, one number per group (`field("v").sum()`);
 * - a **function expression**, one `Fun<number>` per group, which only the
 *   shape form of `ribbon` and `line` reads, every function channel at the
 *   mark's one parameter t (`band.tsx`).
 *
 * This module holds the function value a spec writes (`fun(at, { domain
 * })`, the same function in every group), the test for a function
 * expression, and {@link groupFun}, the one place that reads a function
 * expression's function for a group.
 */
import { identity, opaque, type Fun } from "./fun";
import type { Quantity } from "./measure";
import {
  evalGroup,
  holdsClosureStep,
  liftsPerGroup,
  type UnitLike,
} from "./fieldExpr";

declare const exprKind: unique symbol;

/** Type-level only: a value expression, one number per group
 *  (`field("v").sum()`, a reduce that returns a number). A value channel of
 *  any mark takes one; nothing chains after it. */
export interface ValueExpr {
  readonly [exprKind]: "value";
}

/** Type-level only: a function expression, one function of the mark's
 *  parameter per group. Only `ribbon` and `line` take one in a channel. */
export interface FunctionExpr {
  readonly [exprKind]: "function";
  /** `t ↦ t` over this function's own domain: the position channel that
   *  reads it at the mark's parameter. */
  support(): FunctionExpr;
}

/**
 * What `field(x).reduce(fn)` gives for a result of type `V`, lifted by its
 * shape: a number is a value expression, a `Fun<number>` a function
 * expression, and a record an object with one method per member, each
 * lifted the same way (a method member keeps its arguments). An array, or
 * anything else, is a {@link LiftError}, which no channel takes.
 */
export type Lift<V> = [V] extends [number | null | undefined]
  ? ValueExpr
  : V extends Fun<number>
    ? FunctionExpr
    : V extends readonly unknown[]
      ? LiftError<"a reduce returns a number, a function or a record, not an array">
      : V extends (...args: never[]) => unknown
        ? LiftError<"a reduce returns a number, a function or a record, not a JS function">
        : V extends object
          ? { readonly [K in keyof V]: LiftMember<V[K]> }
          : LiftError<"a reduce returns a number, a function or a record">;

declare const liftError: unique symbol;

/** Type-level only: what a reduce whose result has no lift gives. No
 *  channel takes it, so using it is a type error that names the reason. */
export interface LiftError<Reason extends string> {
  readonly [liftError]: Reason;
}

/** A member of a lifted record: a method member keeps its arguments, and a
 *  plain member is read with no arguments. */
export type LiftMember<T> = T extends (...args: infer A) => infer W
  ? (...args: A) => Lift<W>
  : () => Lift<T>;

/** The `unit` option of a reduce whose result is `V`: one unit for every
 *  number in it, or a record that mirrors its shape. */
export type Units<V> =
  | UnitLike
  | ([V] extends [number | null | undefined]
      ? never
      : V extends Fun<number>
        ? never
        : V extends (...args: never[]) => infer W
          ? Units<W>
          : V extends object
            ? { readonly [K in keyof V]?: Units<V[K]> }
            : never);

const FUN_VALUE: unique symbol = Symbol.for("gofish.funValue");

/**
 * A function value as a spec holds it: a `Fun<number>` that is also a
 * function expression, the same function in every group. Its `support()` is
 * the identity over its domain, the position channel that reads it at the
 * mark's parameter: `line({ x: trend.support(), y: trend })`. It is frozen.
 */
export type FunValue = Fun<number> &
  FunctionExpr & {
    readonly [FUN_VALUE]: true;
    support(): FunValue;
  };

/** Whether `v` is a {@link FunValue}. */
export const isFunValue = (v: unknown): v is FunValue =>
  typeof v === "object" && v !== null && (v as any)[FUN_VALUE] === true;

/** `f` as a {@link FunValue}. */
export const funValue = (f: Fun<number>): FunValue => {
  const out = {
    ...f,
    [FUN_VALUE]: true as const,
    support: (): FunValue => funValue(identity(f.domain)),
  };
  return Object.freeze(out) as unknown as FunValue;
};

/**
 * Make a function value: the function and the interval of t it is defined
 * over, as Chebfun's `chebfun(f, [a, b])` and Julia's `Fun(f, a..b)` take
 * them. `domain` is `[min, max]`, as GoFish writes an interval in an option
 * (`timer({ domain })`, `between(lo, hi)`), with finite ends and `min <
 * max`. The function is opaque: it is read to a tolerance, and a mark draws
 * it by resampling it adaptively to half a pixel. `knots` are places in the
 * domain where it may bend sharply, which every query splits at.
 */
export function fun(
  at: (t: number) => number,
  o: { domain: readonly [number, number]; knots?: readonly number[] }
): FunValue {
  if (typeof at !== "function")
    throw new Error(
      `fun(at, { domain }): at must be a function of t, but it is ${String(at)}.`
    );
  const d = o?.domain;
  if (
    !Array.isArray(d) ||
    d.length !== 2 ||
    !Number.isFinite(d[0]) ||
    !Number.isFinite(d[1]) ||
    !(d[0] < d[1])
  )
    throw new Error(
      `fun(at, { domain }): domain is [min, max], two finite numbers with ` +
        `min < max, but it is ${JSON.stringify(d)}.`
    );
  const domain = { min: d[0], max: d[1] };
  const knots = o.knots?.filter((k) => k >= domain.min && k <= domain.max);
  return funValue(opaque(at, { domain, ...(knots ? { knots } : {}) }));
}

/** Whether `v` is a function expression as the spec is written: a function
 *  value. A reduce's result is one only when its reduce returns a function,
 *  which is known per group ({@link groupFun}). */
export const isFunctionExpr = (v: unknown): boolean => isFunValue(v);

/** The function a function expression gives for one group, and the quantity
 *  its values are amounts of, when it declares one. */
export type GroupFun = { fun: Fun<number>; quantity?: Quantity };

/**
 * The function `expr` gives for the group `rows`, or undefined when it
 * gives none there (a column, or a reduce whose result is a number): the
 * one place a function expression is read. A function value is the same in
 * every group; a reduce runs once per group (the step cache in
 * fieldExpr.ts), so asking twice costs nothing.
 */
export function groupFun(
  expr: unknown,
  rows: readonly unknown[],
  column?: Quantity
): GroupFun | undefined {
  if (isFunValue(expr)) return { fun: expr };
  if (!liftsPerGroup(expr)) return undefined;
  const r = evalGroup(expr as any, rows, column);
  return r.kind === "function"
    ? { fun: r.fun, ...(r.quantity ? { quantity: r.quantity } : {}) }
    : undefined;
}

/** Whether `v` has no wire form: a JS closure, or an expression that holds
 *  one (a function value, a JS map or reduce). The emitter drops such a
 *  value as it drops an accessor (`wireFields` in serialize/toJSON.ts). */
export const hasNoWireForm = (v: unknown): boolean =>
  typeof v === "function" || isFunValue(v) || holdsClosureStep(v);

/** The error for a function value in a channel of a mark that does not draw
 *  along a path. */
export const functionInChannelError = (mark: string, channel: string): Error =>
  new Error(
    `[gofish] ${mark}({ ${channel} }): this channel holds a function value ` +
      `(one function of t per group), but ${mark} takes one value per group ` +
      `here. Only ribbon and line read function values, every function ` +
      `channel at one t: ribbon({ x: f.support(), h: f }). For one number, ` +
      `read the function at a point, or use a value such as ` +
      `field(...).mean().`
  );
