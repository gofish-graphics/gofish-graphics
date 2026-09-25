// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Name Resolution & Scoping — /internals/core/names-and-scoping
// </gofish-wiki>

import type { GoFishAST } from "../_ast";
import { GoFishNode } from "../_node";
import { GoFishRef } from "../_ref";
import { resolveMarkResult } from "../marks/chartBuilder";
import type { ConstraintSpec, ResolvedOperand } from "./index";
import type { ConstraintRef } from "./shared";

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
  | object
  | RelateClause[]
  | null
  | undefined
  | false;

/** A `.relate()` callback: it receives the layer's environment and returns
 *  its clauses (or a promise of them). */
export type RelateFn = (
  env: RelateEnv
) => RelateClause[] | PromiseLike<RelateClause[]>;

const CONSTRAINT_TYPES = new Set([
  "align",
  "distribute",
  "position",
  "zAbove",
  "zBelow",
  "nest",
  "grid",
]);

/** A constraint spec is a plain object built by a `Constraint.*` factory. A
 *  node also has a `type`, so the test is on the object's shape, not only on
 *  the field. */
function isConstraintSpec(c: unknown): c is ConstraintSpec {
  if (c === null || typeof c !== "object") return false;
  const proto = Object.getPrototypeOf(c);
  if (proto !== Object.prototype && proto !== null) return false;
  return CONSTRAINT_TYPES.has((c as { type?: unknown }).type as string);
}

/** Flatten a relate callback's result the way an operator flattens its
 *  children: await any promise (a `For(...)`, an operator call), flatten
 *  nested arrays, and drop `null` / `undefined` / `false`. */
async function flattenClauses(c: unknown): Promise<unknown[]> {
  if (c !== null && typeof (c as PromiseLike<unknown>)?.then === "function") {
    c = await (c as PromiseLike<unknown>);
  }
  if (Array.isArray(c)) {
    return (await Promise.all(c.map(flattenClauses))).flat();
  }
  if (c === null || c === undefined || c === false) return [];
  return [c];
}

/** Split a relate callback's result into its constraints and its drawing
 *  terms, in declaration order. */
export async function splitRelateClauses(result: unknown): Promise<{
  constraints: ConstraintSpec[];
  /** Each drawing term with its 1-based position in the flattened list. */
  terms: { term: unknown; position: number }[];
}> {
  const awaited =
    result !== null &&
    typeof (result as PromiseLike<unknown>)?.then === "function"
      ? await (result as PromiseLike<unknown>)
      : result;
  if (!Array.isArray(awaited)) {
    throw new Error(
      `.relate(): the callback must return a list of clauses, got ${String(
        awaited
      )}.`
    );
  }
  const clauses = await flattenClauses(awaited);
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
  return { constraints, terms };
}

/** Resolve each drawing term to its node, the way an operator resolves its
 *  children. */
export async function reifyRelateTerms(
  terms: { term: unknown; position: number }[]
): Promise<GoFishNode[]> {
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
  return nodes;
}

/** Every ref in `node`'s subtree (a ref has no children of its own). */
function refsIn(node: GoFishAST, out: GoFishRef[] = []): GoFishRef[] {
  if (node instanceof GoFishRef) out.push(node);
  else for (const c of node.children ?? []) refsIn(c, out);
  return out;
}

/** The index of `layer`'s direct child that is or contains `node`, or -1 when
 *  `node` is not inside `layer`. */
function directChildIndex(layer: GoFishNode, node: GoFishAST): number {
  let cur: GoFishAST | undefined = node;
  while (cur && cur.parent !== layer) cur = cur.parent;
  return cur ? layer.children.indexOf(cur) : -1;
}

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
 * Returns the clause children to lay out before the solve and after it, each
 * in evaluation order.
 */
export function scheduleRelate(
  layer: GoFishNode,
  operands: Map<string, ResolvedOperand>
): { beforeSolve: number[]; afterSolve: number[] } {
  const clauses: number[] = [];
  layer.children.forEach((c, i) => {
    if (c instanceof GoFishNode && c._relateClause) clauses.push(i);
  });
  if (clauses.length === 0) return { beforeSolve: [], afterSolve: [] };

  const SOLVE = -1;
  // deps.get(u) = the steps u waits for.
  const deps = new Map<number, Set<number>>([[SOLVE, new Set()]]);
  for (const i of clauses) deps.set(i, new Set());

  for (const op of operands.values()) {
    if (clauses.includes(op.child)) deps.get(SOLVE)!.add(op.child);
  }
  for (const i of clauses) {
    const clause = layer.children[i];
    for (const r of refsIn(clause)) {
      const target = r.targetNode;
      if (!target) continue;
      const j = directChildIndex(layer, target);
      if (j < 0) continue; // outside the layer: already laid out, no edge
      if (j === i) {
        // A ref to the clause itself reads its own result; a ref to a fresh
        // node inside the clause is the clause's own business.
        if (target === clause) deps.get(i)!.add(i);
        continue;
      }
      deps.get(i)!.add(clauses.includes(j) ? j : SOLVE);
    }
  }

  // Kahn's algorithm; the ready step with the smallest declaration index goes
  // first (the solve counts as index -1).
  const order: number[] = [];
  const done = new Set<number>();
  const pending = [SOLVE, ...clauses];
  while (pending.length > 0) {
    const k = pending.findIndex((u) =>
      [...deps.get(u)!].every((d) => done.has(d))
    );
    if (k < 0) {
      throw new Error(
        `.relate(): the clauses of this layer form a cycle; each needs ` +
          `another's result (or its own) to place itself: ` +
          `${pending.map((u) => describeStep(layer, u)).join(", ")}. ` +
          `A drawing clause reads the final positions of the nodes it ` +
          `references, so it cannot also be what places them.`
      );
    }
    const [u] = pending.splice(k, 1);
    order.push(u);
    done.add(u);
  }
  const at = order.indexOf(SOLVE);
  return { beforeSolve: order.slice(0, at), afterSolve: order.slice(at + 1) };
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
  const name =
    node._name === undefined
      ? ""
      : ` named "${typeof node._name === "string" ? node._name : node._name.__tag}"`;
  return `clause ${node._relateClause} (${node.type}${name})`;
}
