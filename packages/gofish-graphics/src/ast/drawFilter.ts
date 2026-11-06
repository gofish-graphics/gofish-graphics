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
 *  spec: undefined when none is given. A raw string stays CSS. A `Filter`
 *  strategy lowers to the one `feColorMatrix` it is, which a backend draws
 *  as an SVG `<filter>` def, not as a CSS function such as `grayscale(1)`:
 *  WebKit ignores CSS filter functions on SVG elements (#1330). */
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
      return {
        kind: "colorMatrix",
        type: "matrix",
        values: grayscaleMatrix(filter.amount ?? 1),
      };
    case "luminanceToAlpha":
      return { kind: "colorMatrix", type: "luminanceToAlpha" };
  }
}

/** The `feColorMatrix` `values` of CSS `grayscale(amount)`, as the Filter
 *  Effects spec defines it: each channel mixes toward the luminance, with
 *  the `[r, g, b]` weights, by `amount`. */
function grayscaleMatrix(amount: number): string {
  const [r, g, b] = [0.2126, 0.7152, 0.0722];
  const inv = 1 - amount;
  const rows = [
    [r + (1 - r) * inv, g - g * inv, b - b * inv, 0, 0],
    [r - r * inv, g + (1 - g) * inv, b - b * inv, 0, 0],
    [r - r * inv, g - g * inv, b + (1 - b) * inv, 0, 0],
    [0, 0, 0, 1, 0],
  ];
  return rows.map((row) => row.map((x) => +x.toFixed(6)).join(" ")).join(" ");
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
