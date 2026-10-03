// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Name Resolution & Scoping — /internals/core/names-and-scoping
// </gofish-wiki>

import type { GoFishAST } from "../_ast";
import { GoFishNode, isRelateClause } from "../_node";
import { GoFishRef } from "../_ref";
import type { ChartBuilder, LayerBuilder } from "../marks/chartBuilder";
import { resolveMarkResult } from "../marks/markResult";
import { flattenAndAwaitPromises } from "../withGoFish";
import {
  validateOperands,
  type ConstraintSpec,
  type ResolvedOperand,
} from "./index";
import { childNameKey, type ConstraintRef } from "./shared";

/**
 * An operand of a `.relate()` callback: a variable that names a node inside
 * the layer. As a constraint operand it is a {@link ConstraintRef} (the solve
 * resolves it by name at layout). In term position, as a child of a drawing
 * clause such as `arrow(opts, [a, b])`, it becomes a string `ref` of the same
 * name (`resolveMarkResult` does the conversion), which resolves from the
 * relating layer.
 */
export class RelateOperand implements ConstraintRef {
  constructor(public readonly name: string) {}
}

/** The environment a `.relate()` callback receives: one operand per name
 *  inside the layer (see `relateEnv` in `constraints/index.ts`). */
export type RelateEnv = Record<string, RelateOperand>;

/** One clause of a `.relate()` callback: a constraint that places its
 *  operands, or a term that draws (an operator or mark, possibly unresolved:
 *  a promise, a mark function, or a chart builder). As with an operator's
 *  children, promises are awaited, nested arrays flatten, and
 *  `null`/`undefined`/`false` entries are dropped, so `cond && clause` and
 *  `For(...)` work. */
export type RelateClause =
  | ConstraintSpec
  | GoFishAST
  | PromiseLike<unknown>
  | ((...args: any[]) => unknown)
  | ChartBuilder<any, any>
  | LayerBuilder
  | RelateClause[]
  | null
  | undefined
  | false;

/** A `.relate()` callback: it receives the layer's environment and returns
 *  its clauses (or a promise of them). */
export type RelateFn = (
  env: RelateEnv
) => RelateClause[] | PromiseLike<RelateClause[]>;

/** Every constraint type, keyed so the compiler checks the list against
 *  `ConstraintSpec`. */
const CONSTRAINT_TYPES: Record<ConstraintSpec["type"], true> = {
  align: true,
  distribute: true,
  position: true,
  zAbove: true,
  zBelow: true,
  nest: true,
  grid: true,
};

/** A constraint spec is a plain object built by a `Constraint.*` factory. A
 *  node also has a `type`, so the test is on the object's shape, not only on
 *  the field. */
function isConstraintSpec(c: unknown): c is ConstraintSpec {
  if (c === null || typeof c !== "object") return false;
  const proto = Object.getPrototypeOf(c);
  if (proto !== Object.prototype && proto !== null) return false;
  const type = (c as { type?: unknown }).type;
  return (
    typeof type === "string" &&
    Object.prototype.hasOwnProperty.call(CONSTRAINT_TYPES, type)
  );
}

const isThenable = (c: unknown): c is PromiseLike<unknown> =>
  c !== null && typeof (c as PromiseLike<unknown>)?.then === "function";

const containsThenable = (c: unknown): boolean =>
  isThenable(c) || (Array.isArray(c) && c.some(containsThenable));

/** Flatten clauses that hold no promise, without awaiting anything: flatten
 *  nested arrays and drop `null` / `undefined` / `false`. A hole in a sparse
 *  array stays an `undefined` clause, as it does on the async path (where
 *  `Promise.all` reads it as `undefined`). */
function flattenClausesSync(c: unknown, out: unknown[] = []): unknown[] {
  if (!Array.isArray(c)) {
    if (c !== null && c !== undefined && c !== false) out.push(c);
    return out;
  }
  for (let i = 0; i < c.length; i++) {
    if (i in c) flattenClausesSync(c[i], out);
    else out.push(undefined);
  }
  return out;
}

/** Flatten clauses the way an operator flattens its children
 *  (`flattenAndAwaitPromises`), with two additions: any thenable is awaited,
 *  not only a `Promise`, and `false` is dropped, so `cond && clause` works. */
async function flattenClausesAsync(c: unknown): Promise<unknown[]> {
  if (isThenable(c)) c = await c;
  const flat = await flattenAndAwaitPromises<unknown>(c);
  const parts = await Promise.all(
    flat.map((x) => (isThenable(x) ? flattenClausesAsync(x) : [x]))
  );
  return parts.flat().filter((x) => x !== false);
}

/**
 * Resolve a relate callback's result into its constraints and its drawing
 * clauses, in declaration order. The result is awaited, must be a list, and
 * is flattened (synchronously when it holds no promise, which is the common
 * case: an operator that relates one constraint per child). Each constraint's
 * operands are checked against `env`. Each other clause is resolved to its
 * node, the way an operator resolves its children, and flagged
 * `_relateClause` with its 1-based position in the flattened list.
 */
export async function resolveRelateClauses(
  result: unknown,
  env: RelateEnv
): Promise<{ constraints: ConstraintSpec[]; nodes: GoFishNode[] }> {
  const awaited = isThenable(result) ? await result : result;
  if (!Array.isArray(awaited)) {
    throw new Error(
      `.relate(): the callback must return a list of clauses, got ${String(
        awaited
      )}.`
    );
  }
  const clauses = containsThenable(awaited)
    ? await flattenClausesAsync(awaited)
    : flattenClausesSync(awaited);
  const constraints: ConstraintSpec[] = [];
  const terms: { term: unknown; position: number }[] = [];
  clauses.forEach((c, i) => {
    const position = i + 1;
    if (isConstraintSpec(c)) constraints.push(c);
    else if (c instanceof RelateOperand || c instanceof GoFishRef) {
      throw new Error(
        `.relate(): clause ${position} is a bare reference${
          c instanceof RelateOperand ? ` ("${c.name}")` : ""
        }. A reference draws nothing and places nothing on its own; use it ` +
          `as an operand of a constraint or as a child of a drawing clause, ` +
          `e.g. arrow({}, [a, b]).`
      );
    } else terms.push({ term: c, position });
  });
  validateOperands(constraints, env);
  // One at a time, like `reifyChildrenSequentially`: resolving a term can
  // have effects (a mark function or builder runs), so their order is kept.
  const nodes: GoFishNode[] = [];
  for (const { term, position } of terms) {
    const node = await resolveMarkResult(term as any, {});
    if (!(node instanceof GoFishNode)) {
      throw new Error(
        `.relate(): clause ${position} is neither a constraint nor a mark or ` +
          `operator (got ${String(node)}).`
      );
    }
    node._relateClause = position;
    nodes.push(node);
  }
  return { constraints, nodes };
}

/** Every ref in `node`'s subtree (a ref has no children of its own). */
function refsIn(node: GoFishAST, out: GoFishRef[] = []): GoFishRef[] {
  if (node instanceof GoFishRef) out.push(node);
  else for (const c of node.children ?? []) refsIn(c, out);
  return out;
}

/** `layer`'s direct child that is or contains `node`, or `undefined` when
 *  `node` is not inside `layer`. */
function directChildOf(
  layer: GoFishNode,
  node: GoFishAST
): GoFishAST | undefined {
  let cur: GoFishAST | undefined = node;
  while (cur && cur.parent !== layer) cur = cur.parent;
  return cur;
}

/** The index of `layer`'s direct child that is or contains `node`, or -1 when
 *  `node` is not inside `layer`. */
export function directChildIndex(layer: GoFishNode, node: GoFishAST): number {
  const child = directChildOf(layer, node);
  return child ? layer.children.indexOf(child) : -1;
}

/** The order of one layer's relate steps (see {@link scheduleRelate}). */
export type RelateSchedule = {
  /** The indices of the layer's children that are drawing clauses. */
  clauses: Set<number>;
  /** The clauses to lay out before the solve, in evaluation order. */
  beforeSolve: number[];
  /** The clauses to lay out after the solve, in evaluation order. */
  afterSolve: number[];
};

/**
 * The order in which `layer` evaluates its relate clauses. There are two kinds
 * of step: the SOLVE, which lays out the plain children and runs the layer's
 * constraints (the one joint placement solve), and one step per drawing
 * clause, which lays that clause out. A step that reads a position runs after
 * the step that writes it:
 *
 * - a clause whose refs point into a plain child runs after the solve;
 * - a clause whose refs point into another clause runs after that clause;
 * - the solve runs after any clause that contains a constraint operand.
 *
 * Refs that point outside the layer (a token reaching across scopes) and refs
 * a clause makes to its own fresh insides add no edge. Ties keep declaration
 * order, with the solve first. A cycle, e.g. a clause that reads its own
 * result, is an error naming every clause on it.
 *
 * Returns the clause children, and those to lay out before the solve and
 * after it, each in evaluation order.
 */
export function scheduleRelate(
  layer: GoFishNode,
  operands: Map<string, ResolvedOperand>
): RelateSchedule {
  const clauses = new Set<number>();
  layer.children.forEach((c, i) => {
    if (isRelateClause(c)) clauses.add(i);
  });
  if (clauses.size === 0) return { clauses, beforeSolve: [], afterSolve: [] };

  const SOLVE = -1;
  // deps.get(u) = the steps u waits for.
  const deps = new Map<number, Set<number>>([[SOLVE, new Set()]]);
  for (const i of clauses) deps.set(i, new Set());
  const childIndex = new Map<GoFishAST, number>();
  layer.children.forEach((c, i) => {
    if (!childIndex.has(c)) childIndex.set(c, i);
  });
  // `directChildIndex`, with the index looked up once per child.
  const childOf = (node: GoFishAST): number => {
    const child = directChildOf(layer, node);
    return child ? (childIndex.get(child) ?? -1) : -1;
  };

  for (const op of operands.values()) {
    if (clauses.has(op.child)) deps.get(SOLVE)!.add(op.child);
  }
  for (const i of clauses) {
    const clause = layer.children[i];
    for (const r of refsIn(clause)) {
      const target = r.targetNode;
      if (!target) continue;
      const j = childOf(target);
      if (j < 0) continue; // outside the layer: already laid out, no edge
      if (j === i) {
        // A ref to the clause itself reads its own result; a ref to a fresh
        // node inside the clause is the clause's own business.
        if (target === clause) deps.get(i)!.add(i);
        continue;
      }
      deps.get(i)!.add(clauses.has(j) ? j : SOLVE);
    }
  }

  // Kahn's algorithm; the ready step with the smallest declaration index goes
  // first (the solve counts as index -1).
  const waiting = new Map<number, number>(); // step -> deps not yet done
  const dependents = new Map<number, number[]>(); // step -> steps waiting on it
  for (const [u, ds] of deps) {
    waiting.set(u, ds.size);
    for (const d of ds) {
      const list = dependents.get(d);
      if (list) list.push(u);
      else dependents.set(d, [u]);
    }
  }
  // Ready steps, kept sorted by declaration index.
  const ready: number[] = [];
  const makeReady = (u: number) => {
    let lo = 0;
    let hi = ready.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ready[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    ready.splice(lo, 0, u);
  };
  for (const [u, n] of waiting) if (n === 0) makeReady(u);
  const order: number[] = [];
  while (ready.length > 0) {
    const u = ready.shift()!;
    order.push(u);
    for (const v of dependents.get(u) ?? []) {
      const n = waiting.get(v)! - 1;
      waiting.set(v, n);
      if (n === 0) makeReady(v);
    }
  }
  if (order.length < deps.size) {
    const pending = [SOLVE, ...clauses].filter((u) => waiting.get(u)! > 0);
    throw new Error(
      `.relate(): the clauses of this layer form a cycle; each needs ` +
        `another's result (or its own) to place itself: ` +
        `${pending.map((u) => describeStep(layer, u)).join(", ")}. ` +
        `A drawing clause reads the final positions of the nodes it ` +
        `references, so it cannot also be what places them.`
    );
  }
  const at = order.indexOf(SOLVE);
  return {
    clauses,
    beforeSolve: order.slice(0, at),
    afterSolve: order.slice(at + 1),
  };
}

function describeStep(layer: GoFishNode, u: number): string {
  if (u < 0) {
    const kinds = [...new Set(layer.constraints.map((c) => c.type))];
    return kinds.length > 0
      ? `the layer's constraints (${kinds
          .map((k) => `Constraint.${k}`)
          .join(", ")})`
      : "the layer's plain children";
  }
  const node = layer.children[u] as GoFishNode;
  const name = childNameKey(node);
  return `clause ${node._relateClause} (${node.type}${
    name === undefined ? "" : ` named "${name}"`
  })`;
}

/** Whether two lists hold the same items in the same order. */
function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Schedule `layer`'s relate clauses and remember the result for its layout.
 * `resolveNames` calls this once per resolve pass, as soon as the refs are
 * resolved, so a cycle is reported before the space pass would recurse on it.
 */
export function computeRelateSchedule(
  layer: GoFishNode,
  operands: Map<string, ResolvedOperand>
): RelateSchedule {
  const schedule = scheduleRelate(layer, operands);
  layer._relateSchedule = {
    children: layer.children.slice(),
    constraints: layer.constraints,
    schedule,
  };
  return schedule;
}

/**
 * The schedule `layout` uses: the one `resolveNames` remembered, when the
 * layer still has the children and constraints it was computed from, else a
 * fresh one. A schedule depends on the children, the constraint operands, and
 * the targets of the clauses' refs; the refs are resolved only in
 * `resolveNames`, and every pass that rewrites the tree runs `resolveNames`
 * again (see `reresolve` in gofish.tsx), which recomputes it.
 */
export function relateScheduleForLayout(
  layer: GoFishNode,
  operands: Map<string, ResolvedOperand>
): RelateSchedule {
  const cached = layer._relateSchedule;
  if (
    cached &&
    cached.constraints === layer.constraints &&
    sameItems(cached.children, layer.children)
  ) {
    return cached.schedule;
  }
  return scheduleRelate(layer, operands);
}
