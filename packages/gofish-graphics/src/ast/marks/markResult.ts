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

/** A chart pipeline (`ChartBuilder` or `LayerBuilder`): it resolves to a node
 *  against the layer registry it is given. A mark may return one. */
type ChartPipeline = {
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
 * Resolves whatever a Mark returns into a GoFishNode.
 */
export async function resolveMarkResult(
  raw: MarkChild,
  layerContext?: LayerContext
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
    return raw.withLayerContext(layerContext ?? {}).resolve();
  if (typeof raw === "function")
    return resolveMarkResult(
      // Pass layerContext through so mark wrappers (e.g. .name(...)) that
      // need to register into the layer context still see it when invoked
      // here. Their `d`/`key` args remain undefined since this resolution
      // path is for thunked / curried marks that don't take a datum.
      (raw as Mark<any>)(undefined as any, undefined, layerContext),
      layerContext
    );
  return raw as unknown as GoFishNode;
}
