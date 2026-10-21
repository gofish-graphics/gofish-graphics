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

/** Per-chart registry of named layers for ref()/selectAll() lookup. A string
 *  name is its own key. A `createName` token is keyed by its symbol, which no
 *  string can equal, so its nodes are there for the chart's own use (a later
 *  tier's scope, a sequence's transitions) and stay out of reach of a string
 *  `selectAll`/`ref`. */
export type LayerContext = {
  [key: string | symbol]: {
    data: any[];
    nodes: GoFishNode[];
  };
};

/** The registry key a `.name(...)` value is filed under, or `undefined` when it
 *  names nothing (an empty string, or no name). */
export function layerKey(name: unknown): string | symbol | undefined {
  if (typeof name === "string") return name.length > 0 ? name : undefined;
  if (isToken(name)) return name.__id;
  return undefined;
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
  // a string ref to the node it names, resolved from the relating layer.
  if (raw instanceof RelateOperand)
    return new GoFishRef({ selection: raw.name }) as unknown as GoFishNode;
  // A chart pipeline resolves to its own node. A `.mark(<relational mark>)`
  // chart elaborates to `.mark(anchor).layer(R)`, i.e. a LayerBuilder — so a
  // chart pipeline handed anywhere a mark is taken (a `.layer(...)` tier, a
  // `layer([...])` child) can be one. Its tiers share the ENCLOSING scope's
  // layer context (its own, when there is none), so a `.name(...)` inside it
  // is findable from outside.
  if (isChartPipeline(raw))
    return raw
      .inScope(rows)
      .withLayerContext(layerContext ?? {})
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
