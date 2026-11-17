// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * A distribution as a spec holds it: `Dist.normal({ mean: "mean", sd: "sd"
 * })`, an expression the engine computes once per group, as it computes a
 * field expression (fieldExpr.ts). Each parameter is a number, a column
 * name, or a value expression (`field("t").mean()`), read over the group's
 * rows. The expression's members are read as a reduce's are, through the
 * one lift (`liftLeaf` in fieldExpr.ts): `d.density()` and `d.support()`
 * are functions of t for ribbon and line, `d.median()` and `d.quantile(p)`
 * values for any channel.
 *
 * `d.bin(p)` is a grouping key: the cells of a numeric partition over the
 * distribution's interval (`Bin.quantiles(5)` at its quintiles), each
 * group the distribution restricted to its cell (groupCell.ts).
 *
 * Its wire form is `{ type: "dist", family, params, ops? }`, the params as
 * written (a field expression in its own wire form) and the ops its
 * members (or, as a key, its one `bin`), so it crosses the Python bridge as
 * data.
 */
import {
  binStepToJSON,
  checkBinStep,
  DEFAULT_PARTITION,
  distributionCells,
  type BinStep,
  type Cell,
  type NumberPartition,
  type Partition,
} from "./cells";
import {
  familyDist,
  FAMILY_PARAMS,
  restrictDist,
  type Dist,
  type FamilyName,
} from "./dist";
import {
  distLeafQuantity,
  evalGroup,
  FieldExpr,
  liftLeaf,
  type FieldExprWire,
  type FieldOp,
  type GroupResult,
} from "./fieldExpr";
import type { FunctionExpr, ValueExpr } from "./groupExpr";
import { columnQuantity, PROBABILITY, type Quantity } from "./measure";
import { columnType } from "./schema";
import { cellOn, type CellVariable } from "./groupCell";

/** A parameter of a family: a number, a column whose value is one number
 *  in each group, or a value expression. */
export type DistParam = number | string | FieldExpr | FieldExprWire | ValueExpr;

/** The wire form of a {@link DistExpr}. */
export type DistExprWire = {
  type: "dist";
  family: FamilyName;
  params: Record<string, unknown>;
  ops?: FieldOp[];
};

/** A family's parameters as a spec writes them, each a {@link DistParam}. */
export type DistParams<F extends FamilyName> = {
  readonly [K in (typeof FAMILY_PARAMS)[F][number]]: DistParam;
};

/** The parameter of each family that is an amount of the variable, whose
 *  column's unit the variable is in (an axis over `d.support()` joins one
 *  in that unit). The variable is not that column, so it takes the unit
 *  and not the column's name, and titles no axis. A family with none is
 *  over a variable with no name and no declared unit. */
const LOCATION: Record<FamilyName, string | undefined> = {
  normal: "mean",
  lognormal: undefined,
  uniform: "min",
  exponential: undefined,
};

type MemberOp = Extract<FieldOp, { op: "member" }>;

/**
 * `Dist.normal(...)` and the other families return one of these. Immutable:
 * each member method returns a new expression with one more op. A member
 * that is a function (`density`, `cdf`, `support`) is a function
 * expression; one that is a number (`median`, `mean`, `mass`, `quantile`)
 * a value expression.
 */
export class DistExpr {
  public readonly type = "dist" as const;
  constructor(
    public readonly family: FamilyName,
    public readonly params: Readonly<Record<string, unknown>>,
    /** @internal the members read, in order */
    public readonly _ops: readonly FieldOp[] = []
  ) {}

  protected _member(name: string, args?: unknown[]): DistExpr {
    return new DistExpr(this.family, this.params, [
      ...this._ops,
      { op: "member", name, ...(args ? { args } : {}) },
    ]);
  }

  /** The probability density over the support (or between the 0.001 and
   *  0.999 quantiles where it is unbounded). Valid only in a channel of
   *  ribbon or line. */
  density(): FunctionExpr {
    return this._member("density") as unknown as FunctionExpr;
  }

  /** The probability at or below t, over the same interval as
   *  {@link DistExpr.density}. A ratio. */
  cdf(): FunctionExpr {
    return this._member("cdf") as unknown as FunctionExpr;
  }

  /** `t ↦ t` over the interval {@link DistExpr.density} is drawn over: the
   *  position channel that reads it at the mark's parameter. */
  support(): FunctionExpr {
    return this._member("support") as unknown as FunctionExpr;
  }

  /** The value with probability `p` at or below it. */
  quantile(p: number): ValueExpr {
    if (!(typeof p === "number" && p >= 0 && p <= 1))
      throw new Error(
        `Dist.${this.family}(...).quantile(p): p must be a number in ` +
          `[0, 1], got ${String(p)}.`
      );
    return this._member("quantile", [p]) as unknown as ValueExpr;
  }

  /** The median, `quantile(0.5)`. */
  median(): ValueExpr {
    return this._member("median") as unknown as ValueExpr;
  }

  /** The mean. */
  mean(): ValueExpr {
    return this._member("mean") as unknown as ValueExpr;
  }

  /** The probability in the distribution: 1, or, in a cell of
   *  {@link DistExpr.bin}, the cell's share of it. */
  mass(): ValueExpr {
    return this._member("mass") as unknown as ValueExpr;
  }

  /** A grouping key with regions: the cells of `p` over the interval the
   *  density is drawn over, `Bin.quantiles(n)` at the distribution's own
   *  quantiles, so each cell holds `1 / n` of it. Each group is the
   *  distribution restricted to its cell. Valid only in a `by` slot, such
   *  as `partition`'s. */
  bin(p: Partition): DistExpr {
    const where = `Dist.${this.family}(...).bin`;
    if (this._ops.length > 0)
      throw new Error(
        `${where}: bin a distribution itself, not one of its members or ` +
          `its cells.`
      );
    return new DistExpr(this.family, this.params, [
      { op: "bin", partition: numberStep(checkBinStep(p, where), where) },
    ]);
  }

  toJSON(): DistExprWire {
    return {
      type: "dist",
      family: this.family,
      params: Object.fromEntries(
        Object.entries(this.params).map(([k, v]) => [
          k,
          v instanceof FieldExpr ? v.toJSON() : v,
        ])
      ),
      ...(this._ops.length
        ? {
            ops: this._ops.map((op) =>
              op.op === "bin" && op.partition !== undefined
                ? {
                    op: "bin" as const,
                    partition: binStepToJSON(op.partition as BinStep),
                  }
                : op
            ),
          }
        : {}),
    };
  }
}

/** Whether `v` is a distribution expression, a {@link DistExpr} or its
 *  wire form. */
export const isDistExpr = (v: unknown): v is DistExpr | DistExprWire =>
  typeof v === "object" &&
  v !== null &&
  (v as any).type === "dist" &&
  typeof (v as any).family === "string";

/** A family's expression, its parameters checked against the family's. */
export function distExpr<F extends FamilyName>(
  family: F,
  params: DistParams<F>
): DistExpr {
  const where = `Dist.${family}`;
  const names = FAMILY_PARAMS[family] as readonly string[];
  if (params === null || typeof params !== "object")
    throw new Error(
      `${where}({ ${names.join(", ")} }): give the parameters as an object.`
    );
  for (const k of Object.keys(params))
    if (!names.includes(k))
      throw new Error(
        `${where}: no parameter "${k}"; its parameters are ${names.join(", ")}.`
      );
  for (const k of names) {
    const v = (params as Record<string, unknown>)[k];
    if (
      !(
        typeof v === "number" ||
        typeof v === "string" ||
        (typeof v === "object" && v !== null && (v as any).type === "field")
      )
    )
      throw new Error(
        `${where}: ${k} must be a number, a column name or a value ` +
          `expression (field("x").mean()), got ${String(v)}.`
      );
  }
  return new DistExpr(family, params as Record<string, unknown>);
}

/** The probability a family's mass is in. */
const PROBABILITY_QUANTITY: Quantity = {
  name: "probability",
  unit: PROBABILITY,
};

/** The variable a family is over: amounts in the unit of its location
 *  parameter's quantity `location` (see {@link LOCATION}), with no name.
 *  Without one, or with a location in no declared unit, its unit is
 *  unknown. */
const variableIn = (location: Quantity | undefined): Quantity =>
  location?.unit !== undefined ? { unit: location.unit } : {};

/**
 * One parameter's value for the group `rows`, and its quantity: a number as
 * it is; a column's or an expression's one value in the group. A column
 * with several values in one group is an error: a family takes one value
 * per group.
 */
function paramOf(
  where: string,
  key: string,
  param: unknown,
  rows: readonly unknown[]
): { value: number; quantity?: Quantity } {
  if (typeof param === "number") return { value: param };
  const name =
    typeof param === "string" ? param : (param as FieldExprWire).name;
  const column = columnQuantity(name, columnType(rows, name));
  const r: GroupResult = evalGroup(
    param as string | FieldExprWire,
    rows,
    column
  );
  if (r.kind === "function")
    throw new Error(
      `${where}: ${key} is a function of t, but a parameter is one number.`
    );
  if (r.kind === "value")
    return { value: Number(r.value), quantity: r.quantity ?? column };
  const values = [...new Set(r.values)];
  if (values.length !== 1)
    throw new Error(
      `${where}: ${key} reads the column "${name}", which has ` +
        `${values.length === 0 ? "no value" : `${values.length} values (${values.slice(0, 3).join(", ")}${values.length > 3 ? ", ..." : ""})`} ` +
        `in one group. A parameter is one number per group: split the ` +
        `rows so each group has one, or fold them (field("${name}").mean()).`
    );
  return { value: Number(values[0]), quantity: r.quantity ?? column };
}

/** A distribution's cells are of numbers: a Calendar value or a product is
 *  an error. */
function numberStep(step: BinStep, where: string): NumberPartition {
  const kind = Array.isArray(step)
    ? undefined
    : (step as { kind?: unknown }).kind;
  if (kind !== "step" && kind !== "thresholds" && kind !== "quantiles")
    throw new Error(
      `${where}: a distribution's cells are intervals of numbers: use ` +
        `Bin.step, Bin.thresholds or Bin.quantiles, not ${String(step)}.`
    );
  return step as NumberPartition;
}

/** The variable a distribution is over, as a group's cell names it: its
 *  family and its parameters as the wire writes them. Two expressions of
 *  one family over the same parameters are over the same variable,
 *  whatever members they read. */
export function distVariable(expr: DistExpr | DistExprWire): CellVariable {
  const { family, params } =
    expr instanceof DistExpr ? expr.toJSON() : (expr as DistExprWire);
  return { kind: "dist", id: JSON.stringify({ family, params }) };
}

/** The family's Dist for the group `rows`, and the quantity of the
 *  variable it is over. In a cell of a key over the same distribution
 *  (`d.bin(p)`), it is the whole group's Dist restricted to the cell. */
function distOf(
  expr: DistExpr | DistExprWire,
  rows: readonly unknown[]
): { dist: Dist; variable: Quantity } {
  const cell = cellOn(rows, distVariable(expr));
  if (cell !== undefined) {
    const whole = distOf(expr, cell.whole);
    return {
      dist: restrictDist(whole.dist, cell.cell),
      variable: whole.variable,
    };
  }
  const where = `Dist.${expr.family}`;
  const names = FAMILY_PARAMS[expr.family] as readonly string[];
  if (names === undefined) throw new Error(`Dist: no family "${expr.family}".`);
  const values: Record<string, number> = {};
  let location: Quantity | undefined;
  for (const k of names) {
    const p = paramOf(where, k, expr.params[k], rows);
    values[k] = p.value;
    if (k === LOCATION[expr.family] && p.quantity !== undefined)
      location = p.quantity;
  }
  return {
    dist: familyDist(expr.family, values as any),
    variable: variableIn(location),
  };
}

/** Whether `v` is a distribution binned into cells, `d.bin(p)`: a key. */
export const isDistKey = (v: unknown): v is DistExpr | DistExprWire =>
  isDistExpr(v) && opsOf(v).some((op) => op.op === "bin");

const opsOf = (expr: DistExpr | DistExprWire): readonly FieldOp[] =>
  expr instanceof DistExpr ? expr._ops : (expr.ops ?? []);

/** The cells of the key `d.bin(p)` over the group `rows`, in order, and
 *  the quantity of the variable they are intervals of: the partition's
 *  cells over the interval the group's distribution is drawn over. */
export function distKeyCells(
  expr: DistExpr | DistExprWire,
  rows: readonly unknown[]
): { cells: Cell[]; variable: Quantity } {
  const where = `Dist.${expr.family}(...).bin`;
  const ops = opsOf(expr);
  if (ops.length !== 1 || ops[0].op !== "bin")
    throw new Error(
      `${where}: a key is the distribution binned once, d.bin(p), with no ` +
        `member.`
    );
  const step = numberStep(
    checkBinStep(
      (ops[0] as Extract<FieldOp, { op: "bin" }>).partition ??
        DEFAULT_PARTITION,
      where
    ),
    where
  );
  const { dist, variable } = distOf(expr, rows);
  const { min, max } = dist.support.domain;
  return {
    cells: distributionCells(
      step,
      min,
      max,
      (p) => {
        const q = dist.quantile(p);
        if (q === undefined)
          throw new Error(`${where}: the distribution has no values to cut.`);
        return q;
      },
      where
    ),
    variable,
  };
}

/** The members a distribution expression reads; any other op is an error
 *  in a value channel. */
const membersOf = (expr: DistExpr | DistExprWire): MemberOp[] =>
  opsOf(expr).map((op) => {
    if (op.op !== "member")
      throw new Error(
        `Dist.${expr.family}(...).${op.op}(...) is a grouping key (\`by\`), ` +
          `not a value: read a member, d.density() or d.median().`
      );
    return op;
  });

/** One group's value of a distribution expression: its Dist, read through
 *  its members, by the one lift. The Dist with no member is an error there:
 *  a channel takes a number or a function. */
export function evalDistGroup(
  expr: DistExpr | DistExprWire,
  rows: readonly unknown[]
): GroupResult {
  const { dist, variable } = distOf(expr, rows);
  return liftLeaf(
    dist,
    membersOf(expr),
    `Dist.${expr.family}(...)`,
    distLeafQuantity(variable, PROBABILITY_QUANTITY)
  );
}
