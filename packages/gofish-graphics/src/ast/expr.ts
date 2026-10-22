// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * Expressions: a value built from field reads, source reads, literals and a
 * fixed set of operations, written as data instead of as a function, so it can
 * be written to the frontend IR and evaluated in JS on either side of the
 * bridge. The vocabulary is polars' (`when/then/otherwise`, `gt`, `clip`,
 * `fillNull`, `concatStr`), spelled as methods the way nodejs-polars spells
 * them.
 *
 *   when(field("count").sum().gt(cut)).then("#d62728").otherwise("#6b9bd1")
 *
 * An expression is ALSO a function of the datum, so it is a valid accessor
 * anywhere a function accessor is: a channel, a `filter` predicate, a
 * `time.transition({ at })`. Nothing downstream learns a new value kind; the
 * frontend-IR emitter is the one reader that looks inside (`exprToIR`).
 *
 * The leaves are literals, `field(name)` (with its aggregates), and SOURCES:
 * the reactive inputs (`timer`, `signal`, `wheel`, `pointer`, `drag`,
 * `click`). A source is an object that carries the {@link SOURCE} protocol: a
 * kind, the declaration it was made from (its wire form), and a `read`
 * function for each of its readable values. A clock, a signal and a wheel are
 * expressions of their own value; a pointer or a drag has several readable
 * values (`src/interaction/readers.ts` names them), each one an expression.
 *
 * Which TIER a source read in an expression lands in (paint or pipeline) is
 * decided by `tierOf` (`src/ast/exprTier.ts`), from the channel and the
 * expression, by one rule.
 */
import type { Frontend } from "gofish-ir";
import { FieldExpr, evalFieldValues, getFieldOps } from "./fieldExpr";

/* ------------------------------ sources ------------------------------- */

/** The protocol every source carries. */
export const SOURCE: unique symbol = Symbol.for("gofish.source");

export interface SourceProtocol {
  /** The source's kind, as the frontend IR names it (`"timer"`, `"drag"`). */
  kind: string;
  /** The options the source was made with, as its IR declaration carries
   *  them, or a reason it has none (an option that is a JS function). */
  declaration: Record<string, unknown> | { noWire: string };
  /**
   * Read one of the source's values. `read` is undefined for the source's
   * own value (a clock's playhead, a signal's state), or the name of one of
   * its readable values (`"y"` of a drag, `"over"` of a pointer); `arg` is
   * that read's argument, if it takes one (a pointer's `"field"` read names
   * a field). `datum` is the datum the expression is evaluated at, which a
   * read about the mark itself (`"over"`) needs. An unknown read throws.
   */
  read(
    read: string | undefined,
    arg: string | undefined,
    datum: unknown
  ): unknown;
}

export type Source = { readonly [SOURCE]: SourceProtocol };

export const isSource = (v: unknown): v is Source =>
  v !== null &&
  (typeof v === "object" || typeof v === "function") &&
  (v as Partial<Source>)[SOURCE] !== undefined;

/* ------------------------------- nodes -------------------------------- */

/** An operation's name. The operations and their arities are declared once,
 *  in gofish-ir (`Frontend.EXPR_OPS`); `evalOp` below implements each. */
export type ExprOp = Frontend.ExprOpName;

/** An expression tree in JS: the IR's shape (`Frontend.ExprIR`), with the
 *  source object in place of its id and the `FieldExpr` in place of its wire
 *  form. */
export type ExprNode =
  | { type: "lit"; value: string | number | boolean | null }
  | { type: "source"; source: Source; read?: string; arg?: string }
  | { type: "field"; field: FieldExpr }
  | { type: "op"; op: ExprOp; args: ExprNode[] }
  | {
      type: "when";
      branches: [ExprNode, ExprNode][];
      otherwise: ExprNode;
    };

/** What an expression method takes: another expression, a source, a field
 *  expression, or a literal. */
export type ExprInput =
  | Expr
  | Source
  | FieldExpr
  | string
  | number
  | boolean
  | null;

const EXPR: unique symbol = Symbol.for("gofish.expr");

/** The methods every expression (and every source that is an expression of
 *  its own value, and every `field(...)`) has. Each returns a new expression;
 *  nothing is evaluated until the expression is read at a datum. */
export interface ExprMethods {
  /** `this > other`. Null if either side is null. */
  gt(other: ExprInput): Expr;
  /** `this >= other`. */
  gtEq(other: ExprInput): Expr;
  /** `this < other`. */
  lt(other: ExprInput): Expr;
  /** `this <= other`. */
  ltEq(other: ExprInput): Expr;
  /** `this === other`. */
  eq(other: ExprInput): Expr;
  /** `this !== other`. */
  neq(other: ExprInput): Expr;
  add(other: ExprInput): Expr;
  sub(other: ExprInput): Expr;
  mul(other: ExprInput): Expr;
  div(other: ExprInput): Expr;
  /** Boolean and, with polars' three-valued logic (false wins over null). */
  and(other: ExprInput): Expr;
  /** Boolean or (true wins over null). */
  or(other: ExprInput): Expr;
  not(): Expr;
  /** Clamp into `[lo, hi]`. */
  clip(lo: ExprInput, hi: ExprInput): Expr;
  /** `this`, or `value` where `this` is null. */
  fillNull(value: ExprInput): Expr;
  floor(): Expr;
  round(): Expr;
}

/** An expression: a function of the datum (so it is an accessor) that is
 *  also data (so it crosses the IR). */
export interface Expr extends ExprMethods {
  (datum?: unknown): any;
  readonly [EXPR]: ExprNode;
}

export const isExpr = (v: unknown): v is Expr =>
  typeof v === "function" && (v as Partial<Expr>)[EXPR] !== undefined;

/** Whether `v` is something an expression can be read from: an expression or
 *  a source of one value. A `field(...)` is not counted: it is an accessor of
 *  its own, read by the channels directly. */
export const isExprValue = (v: unknown): v is Expr | Source =>
  isExpr(v) || (typeof v === "function" && isSource(v));

/** The tree of an expression input. */
export function exprNode(v: ExprInput): ExprNode {
  if (isExpr(v)) return v[EXPR];
  if (isSource(v)) return { type: "source", source: v };
  if (v instanceof FieldExpr) return { type: "field", field: v };
  if (
    v === null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  )
    return { type: "lit", value: v };
  throw new Error(
    `[gofish] expression: ${describe(v)} is not an expression, a source, a ` +
      `field(...), or a literal (a string, number, boolean or null).`
  );
}

const describe = (v: unknown): string =>
  typeof v === "function"
    ? "a function"
    : Array.isArray(v)
      ? "an array"
      : typeof v === "object"
        ? "an object"
        : `${typeof v} ${String(v)}`;

/** Wrap a tree as an expression. */
export function makeExpr(node: ExprNode): Expr {
  const fn = ((datum?: unknown) => evalExpr(node, datum)) as Expr;
  Object.defineProperty(fn, EXPR, { value: node });
  return Object.assign(
    fn,
    exprMethods(() => node)
  );
}

const op = (name: ExprOp, args: ExprNode[]): Expr =>
  makeExpr({ type: "op", op: name, args });

/** The methods, over a thunk of the receiver's tree (a source's tree is made
 *  on demand, so the source object need not exist before its methods do). */
export function exprMethods(self: () => ExprNode): ExprMethods {
  const binary =
    (name: ExprOp) =>
    (other: ExprInput): Expr =>
      op(name, [self(), exprNode(other)]);
  return {
    gt: binary("gt"),
    gtEq: binary("gtEq"),
    lt: binary("lt"),
    ltEq: binary("ltEq"),
    eq: binary("eq"),
    neq: binary("neq"),
    add: binary("add"),
    sub: binary("sub"),
    mul: binary("mul"),
    div: binary("div"),
    and: binary("and"),
    or: binary("or"),
    not: () => op("not", [self()]),
    clip: (lo, hi) => op("clip", [self(), exprNode(lo), exprNode(hi)]),
    fillNull: binary("fillNull"),
    floor: () => op("floor", [self()]),
    round: () => op("round", [self()]),
  };
}

/** Give a source that is an expression of its own value the expression
 *  methods (`year.floor()`, `cut.gt(50)`). */
export function withExprMethods<S extends Source>(source: S): S & ExprMethods {
  return Object.assign(
    source,
    exprMethods(() => ({ type: "source", source }))
  );
}

/** An expression of one read of a source with several readable values
 *  (`readers.ts` spells these as properties). */
export const sourceRead = (source: Source, read: string, arg?: string): Expr =>
  makeExpr({
    type: "source",
    source,
    read,
    ...(arg !== undefined ? { arg } : {}),
  });

/* ---------------------------- when / concat ---------------------------- */

/** The chain `when(c).then(x)` returns: an expression (null where no branch
 *  holds) that takes more branches and an `otherwise`. */
export interface Then extends Expr {
  when(condition: ExprInput): { then(value: ExprInput): Then };
  otherwise(value: ExprInput): Expr;
}

function thenChain(branches: [ExprNode, ExprNode][]): Then {
  const node: ExprNode = {
    type: "when",
    branches,
    otherwise: { type: "lit", value: null },
  };
  return Object.assign(makeExpr(node), {
    when: (condition: ExprInput) => ({
      then: (value: ExprInput) =>
        thenChain([...branches, [exprNode(condition), exprNode(value)]]),
    }),
    otherwise: (value: ExprInput) =>
      makeExpr({ type: "when", branches, otherwise: exprNode(value) }),
  });
}

/**
 * `when(condition).then(value)` — polars' conditional. Chain more branches
 * with `.when(c).then(v)` and end with `.otherwise(v)`; the first branch whose
 * condition is true gives the value, and with no `otherwise` the value is
 * null where none is.
 */
export function when(condition: ExprInput): { then(value: ExprInput): Then } {
  return {
    then: (value: ExprInput) =>
      thenChain([[exprNode(condition), exprNode(value)]]),
  };
}

/** `concatStr(...parts)` — the parts as text, joined (polars' `concat_str`).
 *  Null if any part is null. */
export const concatStr = (...parts: ExprInput[]): Expr =>
  op("concatStr", parts.map(exprNode));

/* ------------------------------ evaluation ----------------------------- */

const isNull = (v: unknown): v is null | undefined => v == null;

/** The rows a datum stands for: a mark's datum is the bag of rows that
 *  flowed into it, and a row read by a per-row accessor is a bag of one. */
const rowsOf = (datum: unknown): unknown[] =>
  Array.isArray(datum) ? datum : datum == null ? [] : [datum];

function evalField(field: FieldExpr, datum: unknown): unknown {
  const { values } = evalFieldValues(field, rowsOf(datum) as any[]);
  if (getFieldOps(field).length > 0) return values[0] ?? null;
  const distinct = [...new Set(values)];
  if (distinct.length <= 1) return distinct[0] ?? null;
  throw new Error(
    `[gofish] expression: field("${field.name}") has ${distinct.length} ` +
      `different values over this mark's rows. Fold them first, with ` +
      `field("${field.name}").sum() or .mean().`
  );
}

const num = (v: unknown, op: string): number => {
  if (typeof v !== "number")
    throw new Error(
      `[gofish] expression: .${op}() needs numbers, got ${describe(v)}.`
    );
  return v;
};

/** Evaluate `node` at `datum`. Null in, null out, as in polars, except for
 *  `fillNull` (which replaces it), `and`/`or` (three-valued) and `when`
 *  (a null condition does not hold). */
export function evalExpr(node: ExprNode, datum: unknown): any {
  switch (node.type) {
    case "lit":
      return node.value;
    case "source":
      return node.source[SOURCE].read(node.read, node.arg, datum) ?? null;
    case "field":
      return evalField(node.field, datum);
    case "when": {
      for (const [c, v] of node.branches)
        if (evalExpr(c, datum) === true) return evalExpr(v, datum);
      return evalExpr(node.otherwise, datum);
    }
    case "op":
      return evalOp(node.op, node.args, datum);
  }
}

function evalOp(name: ExprOp, args: ExprNode[], datum: unknown): unknown {
  const vs = args.map((a) => evalExpr(a, datum));
  switch (name) {
    case "fillNull":
      return isNull(vs[0]) ? vs[1] : vs[0];
    case "and":
      if (vs[0] === false || vs[1] === false) return false;
      return isNull(vs[0]) || isNull(vs[1]) ? null : true;
    case "or":
      if (vs[0] === true || vs[1] === true) return true;
      return isNull(vs[0]) || isNull(vs[1]) ? null : false;
    case "concatStr":
      return vs.some(isNull) ? null : vs.map(String).join("");
  }
  if (vs.some(isNull)) return null;
  const [a, b] = vs;
  switch (name) {
    case "gt":
      return (a as number) > (b as number);
    case "gtEq":
      return (a as number) >= (b as number);
    case "lt":
      return (a as number) < (b as number);
    case "ltEq":
      return (a as number) <= (b as number);
    case "eq":
      return a === b;
    case "neq":
      return a !== b;
    case "add":
      return num(a, name) + num(b, name);
    case "sub":
      return num(a, name) - num(b, name);
    case "mul":
      return num(a, name) * num(b, name);
    case "div":
      return num(a, name) / num(b, name);
    case "not":
      return !a;
    case "clip":
      return Math.min(num(vs[2], name), Math.max(num(b, name), num(a, name)));
    case "floor":
      return Math.floor(num(a, name));
    case "round":
      return Math.round(num(a, name));
  }
}

/** Every source an expression reads. */
export function sourcesOf(
  node: ExprNode,
  out = new Set<Source>()
): Set<Source> {
  switch (node.type) {
    case "source":
      out.add(node.source);
      break;
    case "op":
      node.args.forEach((a) => sourcesOf(a, out));
      break;
    case "when":
      node.branches.forEach(([c, v]) => (sourcesOf(c, out), sourcesOf(v, out)));
      sourcesOf(node.otherwise, out);
      break;
  }
  return out;
}

/* ------------------------------ field(...) ------------------------------ */

// A `field(...)` is an expression leaf, so it takes the expression methods
// too (`field("count").sum().gt(cut)`). They are added here rather than in
// fieldExpr.ts so that module keeps no runtime dependency on this one.
declare module "./fieldExpr" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface FieldExpr<HasRegion extends boolean, Binned extends boolean>
    extends ExprMethods {}
}

const METHOD_NAMES = Object.keys(
  exprMethods(() => ({ type: "lit", value: null }))
) as (keyof ExprMethods)[];

for (const name of METHOD_NAMES) {
  Object.defineProperty(FieldExpr.prototype, name, {
    value: function (this: FieldExpr, ...args: unknown[]) {
      const bound = exprMethods(() => ({ type: "field", field: this }));
      return (bound[name] as (...a: unknown[]) => Expr)(...args);
    },
    writable: true,
    configurable: true,
  });
}
