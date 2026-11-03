/**
 * The `filter` option every mark and `layer` take (#1267): a `Filter`
 * strategy (`families/filter.ts`) or a raw CSS filter string. The node keeps
 * it as the display-list filter it draws with (`GoFishNode._filter`), and
 * `INTERNAL_lower` draws the node's whole drawing in one group under it. A
 * filtered node is a bake boundary (`coordinateTransforms/bake.ts`), so a
 * filtered `layer` is lowered as one drawing too.
 */
import { Frontend, type DisplayList } from "gofish-ir";
import type { Filter } from "../families/filter";
import { kindValue } from "./strategyKind";
import type { GoFishNode } from "./_node";

/** What the `filter` option takes. */
export type FilterOption = Filter | string;

/** The `filter` option, as every mark's and `layer`'s options hold it. */
export type FilterOptions = { filter?: FilterOption };

/** The display-list filter a `filter` option draws with, checked once per
 *  spec: undefined when none is given. `grayscale` is a CSS function;
 *  `luminanceToAlpha` has none, so a backend draws its SVG def. */
export function displayFilter(
  value: FilterOption | undefined,
  where: string
): DisplayList.DisplayFilter | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return { kind: "css", value };
  const filter = kindValue(value) as Filter;
  Frontend.checkStrategy("Filter", filter, where);
  switch (filter.kind) {
    case "grayscale":
      return { kind: "css", value: `grayscale(${filter.amount ?? 1})` };
    case "luminanceToAlpha":
      return { kind: "luminanceToAlpha" };
  }
}

/** Give `node` a filter made by {@link displayFilter}; `undefined` leaves
 *  it. */
export function applyFilter<N extends GoFishNode>(
  node: N,
  filter: DisplayList.DisplayFilter | undefined
): N {
  if (filter !== undefined) node._filter = filter;
  return node;
}
