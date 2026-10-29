// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki The Mark Factory — /internals/frontend/mark-factory
// </gofish-wiki>

/**
 * What a mark returns, and the per-chart registry named marks join.
 *
 * `chartBuilder.ts` and `createOperator.ts` (with every module that builds a
 * node from a mark) both import from here, and this module imports neither,
 * so the dependency between the two runs one way: chartBuilder imports
 * createOperator (for `nameableMark`), never the reverse.
 */

import { GoFishNode } from "../_node";
import { GoFishRef } from "../_ref";
import { RelateOperand } from "../constraints/relate";
import { isToken } from "../createName";
import type { Mark, MarkChild } from "../types";

/** The marks one name stands for in a registry: the nodes, and the datum of
 *  each, in registration order. */
export type LayerEntry = { data: any[]; nodes: GoFishNode[] };

/** The registry key a `.name(...)` value is filed under, or `undefined` when it
 *  names nothing (an empty string, or no name). */
export function layerKey(name: unknown): string | symbol | undefined {
  if (typeof name === "string") return name.length > 0 ? name : undefined;
  if (isToken(name)) return name.__id;
  return undefined;
}

let nextScope = 0;

/**
 * A registry of named marks for `ref()`/`selectAll()` lookup, and the scope
 * it belongs to. A string name is its own key. A `createName` token is keyed
 * by its symbol, which no string can equal, so its nodes are there for the
 * chart's own use (a later tier's scope, a sequence's transitions) and stay
 * out of reach of a string `selectAll`/`ref`.
 *
 * The registries form a scope tree: a `layer([...])` combinator's registry
 * is a child of the registry of the place it is built in (a chart, an
 * operator's cell, another layer). A registry with no parent is a root: a
 * top-level render, or the body of a `createMark` component, which is the
 * boundary of every name lookup. A registry links only to its parent. Each
 * new name is indexed upward when it is registered: every ancestor records
 * the nearest depth below it that has the name, and the registries at that
 * depth, so a lookup reads one index entry per ancestor.
 */
export class LayerContext {
  /** Creation order: the order of a parent's children. */
  readonly seq = nextScope++;
  readonly depth: number;
  private readonly own = new Map<string | symbol, LayerEntry>();
  private readonly nearest = new Map<
    string | symbol,
    { depth: number; scopes: LayerContext[] }
  >();

  /** The registries nested in this one, in creation order. */
  private readonly kids: LayerContext[] = [];

  constructor(readonly parent?: LayerContext) {
    this.depth = parent ? parent.depth + 1 : 0;
    parent?.kids.push(this);
  }

  /** A fresh registry nested in this one. */
  child(): LayerContext {
    return new LayerContext(this);
  }

  /** The marks filed under `key` in this registry itself, not widened. */
  get(key: string | symbol): LayerEntry | undefined {
    return this.own.get(key);
  }

  /** File `node` under `key` in this registry. */
  register(key: string | symbol, node: GoFishNode): void {
    let entry = this.own.get(key);
    if (!entry) {
      this.own.set(key, (entry = { data: [], nodes: [] }));
      this.indexUpward(key);
    }
    entry.nodes.push(node);
    entry.data.push((node as { datum?: unknown }).datum);
  }

  /** Remove this registry, and every registry nested in it, from its
   *  parent: no lookup from an ancestor finds their names afterwards. Each
   *  ancestor's index for those names is rebuilt from its own names and its
   *  remaining nested registries' indices, nearest first. */
  discard(): void {
    const p = this.parent;
    if (p === undefined) return;
    const i = p.kids.indexOf(this);
    if (i < 0) return;
    p.kids.splice(i, 1);
    for (const key of this.nearest.keys())
      for (let s: LayerContext | undefined = p; s; s = s.parent) s.reindex(key);
  }

  /** Rebuild this registry's index for `key`: itself when it has the name,
   *  else the nearest of its nested registries that do, in scope order. */
  private reindex(key: string | symbol): void {
    if (this.own.has(key)) {
      this.nearest.set(key, { depth: 0, scopes: [this] });
      return;
    }
    let best: { depth: number; scopes: LayerContext[] } | undefined;
    for (const kid of this.kids) {
      const at = kid.nearest.get(key);
      if (at === undefined) continue;
      const depth = at.depth + 1;
      if (best === undefined || depth < best.depth)
        best = { depth, scopes: [...at.scopes] };
      else if (depth === best.depth) best.scopes.push(...at.scopes);
    }
    if (best === undefined) this.nearest.delete(key);
    else this.nearest.set(key, best);
  }

  /** Record this registry's new `key` in its own and every ancestor's index.
   *  An ancestor that already knows a nearer registry has passed it on
   *  upward, so the walk stops there. */
  private indexUpward(key: string | symbol): void {
    for (let s: LayerContext | undefined = this; s; s = s.parent) {
      const depth = this.depth - s.depth;
      const at = s.nearest.get(key);
      if (at && at.depth < depth) return;
      if (!at || depth < at.depth) {
        s.nearest.set(key, { depth, scopes: [this] });
      } else {
        const i = at.scopes.findIndex((o) => treeOrder(this, o) < 0);
        at.scopes.splice(i < 0 ? at.scopes.length : i, 0, this);
      }
    }
  }

  /**
   * The marks `key` stands for, seen from this registry, by the same
   * widening lookup `ref("x")` uses over the tree: search this scope and the
   * scopes nested in it, then its parent's, one level at a time, and stop at
   * the first level that has the name. Inside that level the nearest depth
   * wins, and every registry at that depth that has the name contributes its
   * marks, in scope order: a name a split repeats (one `layer` per cell) is
   * plural, so `selectAll` gathers all its marks and the singular `ref`
   * reports how many it found. Never crosses a root. `undefined` when no
   * level has the name.
   */
  lookup(key: string | symbol): LayerEntry | undefined {
    for (let s: LayerContext | undefined = this; s; s = s.parent) {
      const at = s.nearest.get(key);
      if (at)
        return {
          data: at.scopes.flatMap((c) => c.own.get(key)!.data),
          nodes: at.scopes.flatMap((c) => c.own.get(key)!.nodes),
        };
    }
    return undefined;
  }
}

/** Scope order for two registries at the same depth: the creation order of
 *  the children of their nearest common ancestor that hold them. */
function treeOrder(a: LayerContext, b: LayerContext): number {
  while (a.parent !== b.parent) {
    a = a.parent!;
    b = b.parent!;
  }
  return a.seq - b.seq;
}

/**
 * Stash the chained `.name(...)` value directly on a mark function, so a
 * user-chained name can be detected without relying on the `__serialize` tag
 * (absent on untagged custom marks, and it omits Tokens). Every `.name()`
 * implementation calls this, and every modifier chained after it carries the
 * value forward.
 */
export function stashLayerName(mark: object, layerName: unknown): void {
  (mark as any).__layerName = layerName;
}

/** A chart pipeline (`ChartBuilder` or `LayerBuilder`, a `RenderableBuilder`):
 *  it binds the rows of the partition it sits in when it is an empty scope
 *  (`inScope`), and resolves to a node against the layer registry it is
 *  given. It sits in any mark position, and a mark may return one. */
type ChartPipeline = {
  inScope(rows: unknown): ChartPipeline;
  withLayerContext(layerContext: LayerContext): {
    resolve(): Promise<GoFishNode>;
  };
};

function isChartPipeline(raw: unknown): raw is ChartPipeline {
  return (
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as ChartPipeline).withLayerContext === "function"
  );
}

/**
 * The input a mark gets where there are no rows: at a root, or a mark tier
 * with no previous bag. It is the empty list, since a mark's input is always
 * a list, but it is not data, so a node built from it has no datum
 * ({@link datumOfInput}). An empty group (a filter that kept nothing) is a
 * different list, and is data.
 */
export const NO_ROWS: never[] = Object.freeze([]) as unknown as never[];

/** The datum of a node a mark built from input `d`: `d`, or none when `d` is
 *  {@link NO_ROWS}. */
export const datumOfInput = <T>(d: T[]): T[] | undefined =>
  d === NO_ROWS ? undefined : d;

/**
 * Resolve what a mark position holds into a GoFishNode, against the rows of
 * the partition it sits in (`rows`, keyed `key`). This is the one rule for
 * every mark position: a chart's `.mark(...)`, each child of a combinator
 * (`spread`, `stack`, `layer`, ...), a tier of a `.layer(...)` chain. A mark
 * function is called with the rows; a chart or chain (`ChartPipeline`) binds
 * them when it is an empty scope (`RenderableBuilder.inScope`); a node is
 * itself. What a mark function returns is resolved as a root: with
 * {@link NO_ROWS}, the rows of no partition.
 */
export async function resolveMarkResult(
  raw: MarkChild,
  layerContext?: LayerContext,
  rows: unknown = NO_ROWS,
  key?: string | number
): Promise<GoFishNode> {
  // Mark functions are typed as sync-returning, but async marks are a
  // valid pattern (e.g. the Python wrapper's mark-as-function bridges via
  // RPC and returns `Promise<ChartBuilder>`). Await any thenable upfront
  // so the checks below see the resolved value.
  if (raw && typeof (raw as any).then === "function") {
    raw = await (raw as unknown as Promise<ReturnType<Mark<any>>>);
  }
  // A `.relate()` operand in term position (a child of a drawing clause) is
  // a string ref to the node it names, resolved from the layer that bound it.
  if (raw instanceof RelateOperand) return raw.toRef() as unknown as GoFishNode;
  // A chart pipeline resolves to its own node. A `.mark(<relational mark>)`
  // chart elaborates to `.mark(anchor).layer(R)`, i.e. a LayerBuilder — so a
  // chart pipeline handed anywhere a mark is taken (a `.layer(...)` tier, a
  // `layer([...])` child) can be one. Its tiers share the ENCLOSING scope's
  // layer context (its own, when there is none), so a `.name(...)` inside it
  // is findable from outside.
  if (isChartPipeline(raw))
    return raw
      .inScope(rows)
      .withLayerContext(layerContext ?? new LayerContext())
      .resolve();
  if (typeof raw === "function")
    return resolveMarkResult(
      // Pass layerContext through so mark wrappers (e.g. .name(...)) that
      // need to register into the layer context still see it when invoked
      // here.
      (raw as Mark<any>)(rows as any, key, layerContext),
      layerContext
    );
  return raw as unknown as GoFishNode;
}
