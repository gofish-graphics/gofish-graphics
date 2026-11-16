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

declare const exprKind: unique symbol;

/** Type-level only: a function expression, one function of the mark's
 *  parameter per group. Only `ribbon` and `line` take one in a channel. */
export interface FunctionExpr {
  readonly [exprKind]: "function";
  /** `t ↦ t` over this function's own domain: the position channel that
   *  reads it at the mark's parameter. */
  support(): FunctionExpr;
}

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

/** Whether `v` is a function expression: a value that gives one function
 *  per group. */
export const isFunctionExpr = (v: unknown): boolean => isFunValue(v);

/** The function a function expression gives for one group, and the quantity
 *  its values are amounts of, when it declares one. */
export type GroupFun = { fun: Fun<number>; quantity?: Quantity };

/**
 * The function `expr` gives for the group `rows`: the one place a function
 * expression is read. A function value is the same in every group.
 */
export function groupFun(
  expr: unknown,
  _rows: readonly unknown[],
  where: string
): GroupFun {
  if (isFunValue(expr)) return { fun: expr };
  throw new Error(`${where} is not a function expression.`);
}

/** Whether `v` has no wire form: a JS closure, or an expression that holds
 *  one (a function value). The emitter drops such a value as it drops an
 *  accessor (`wireFields` in serialize/toJSON.ts). */
export const hasNoWireForm = (v: unknown): boolean =>
  typeof v === "function" || isFunValue(v);

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
