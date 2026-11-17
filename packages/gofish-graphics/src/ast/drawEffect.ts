/**
 * The `effect` option every mark and `layer` take (#1267): an `Effect`
 * strategy (`families/effect.ts`) or a raw CSS filter string. The node keeps
 * it as the display-list filter it draws with (`GoFishNode._filter`), and
 * `INTERNAL_lower` draws the node's whole drawing in one group under it. A
 * node with an effect is a bake boundary (`coordinateTransforms/bake.ts`), so
 * a `layer` with an effect is lowered as one drawing too.
 */
import { Frontend, type DisplayList } from "gofish-ir";
import type { Effect } from "../families/effect";
import { kindValue } from "./strategyKind";
import type { GoFishNode } from "./_node";

/** What the `effect` option takes. */
export type EffectOption = Effect | string;

/** The `effect` option, as every mark's and `layer`'s options hold it. */
export type WithEffect = { effect?: EffectOption };

/** The display-list filter an `effect` option draws with, checked once per
 *  spec: undefined when none is given. `grayscale` is a CSS function;
 *  `luminanceToAlpha` has none, so a backend draws its SVG def. */
export function displayFilter(
  value: EffectOption | undefined,
  where: string
): DisplayList.DisplayFilter | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return { kind: "css", value };
  const effect = kindValue(value) as Effect;
  Frontend.checkStrategy("Effect", effect, where);
  switch (effect.kind) {
    case "grayscale":
      return { kind: "css", value: `grayscale(${effect.amount ?? 1})` };
    case "luminanceToAlpha":
      return { kind: "luminanceToAlpha" };
  }
}

/** Give `node` a display-list filter made by {@link displayFilter};
 *  `undefined` leaves it. */
export function applyFilter<N extends GoFishNode>(
  node: N,
  filter: DisplayList.DisplayFilter | undefined
): N {
  if (filter !== undefined) node._filter = filter;
  return node;
}
