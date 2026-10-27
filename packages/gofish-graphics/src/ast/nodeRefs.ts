/**
 * The nodes an `avoiding` option names, as fresh refs its holder keeps (each
 * read where it is placed, like a ref member). Shared by `enclose`'s blob
 * (`Shape.blob({ avoiding })`) and `.label({ avoiding })`, which take the
 * same value (`Shape.Nodes`, checked by `nodeSelectionOf`). A
 * `selectAll(name)` resolves against `layerContext`, the chart's named
 * layers.
 */
import { GoFishNode } from "./_node";
import { GoFishRef } from "./_ref";
import { RelateOperand } from "./constraints/relate";
import type { LayerContext } from "./marks/chart";
import { resolveRefData } from "./marks/chartBuilder";
import { nodeSelectionOf } from "./nodeSelection";
import type { Nodes } from "../families/shape";

/**
 * @param where Names the option in errors (`"enclose({ shape }): avoiding"`).
 * @param construct Names the construct in errors (`"enclose"`).
 */
export function avoidedRefs(
  avoiding: Nodes | undefined,
  layerContext: LayerContext | undefined,
  where: string,
  construct: string
): GoFishRef[] {
  if (avoiding === undefined) return [];
  const selection = nodeSelectionOf(avoiding, where);
  let items: unknown[];
  if ("all" in selection) {
    if (layerContext === undefined)
      throw new Error(
        `[gofish] ${where}: selectAll(...) names a chart's layer, so it works where ${construct} is a chart's mark; in the combinator form, list the nodes.`
      );
    const resolved = resolveRefData(selection.all, layerContext);
    items = Array.isArray(resolved) ? resolved : [resolved];
  } else items = selection.items;
  return items.map((item) => {
    if (item instanceof GoFishRef) {
      const target = item.targetNode;
      return target !== undefined
        ? new GoFishRef({ node: target })
        : new GoFishRef({ selection: item.selection! });
    }
    if (item instanceof GoFishNode) return new GoFishRef({ node: item });
    if (item instanceof RelateOperand)
      return new GoFishRef({ selection: item.name });
    throw new Error(
      `[gofish] ${where} lists placed nodes or refs (a .relate() operand, ref(...)); a fresh mark has no place to avoid.`
    );
  });
}
