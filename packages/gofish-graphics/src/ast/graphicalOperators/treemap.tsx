import {
  hierarchy,
  treemap as d3Treemap,
  treemapDice,
  treemapSlice,
} from "d3-hierarchy";
import type { HierarchyNode, HierarchyRectangularNode } from "d3-hierarchy";

import { GoFishNode, Placeable } from "../_node";
import { GoFishAST } from "../_ast";
import { createNodeOperator } from "../withGoFish";
import { FancyDims, Size, elaborateDims } from "../dims";
import { getValue, isValue, MaybeValue } from "../data";
import { computeAesthetic, computeSize } from "../../util";
import { POSITION, UnderlyingSpace } from "../underlyingSpace";
import { interval } from "../../util/interval";

type TreemapTile = "squarify" | "slice" | "dice" | "binary" | "resquarify";
type TreemapSort = "asc" | "desc" | "none";

type TreemapProps = {
  name?: string;
  key?: string;
  paddingInner?: number;
  paddingOuter?: number;
  round?: boolean;
  tile?: TreemapTile;
  sort?: TreemapSort;
  valueField?: string;
  value?: (node: GoFishNode) => number;
} & FancyDims<MaybeValue<number>>;

type LeafDatum = {
  i: number;
  weight: number;
};

function resolveWeightFromChild(
  child: GoFishAST,
  opts: Pick<TreemapProps, "value" | "valueField">
): number {
  if (!(child instanceof GoFishNode)) return 1;
  if (opts.value) {
    const v = Number(opts.value(child));
    return Number.isFinite(v) && v > 0 ? v : 0;
  }
  if (opts.valueField) {
    const d = (child as GoFishNode & { datum?: unknown }).datum;
    if (Array.isArray(d)) {
      const total = d.reduce((acc, row) => {
        const vv = Number(row?.[opts.valueField!]);
        return acc + (Number.isFinite(vv) ? vv : 0);
      }, 0);
      return total > 0 ? total : 0;
    }
    const vv = Number(d?.[opts.valueField]);
    return Number.isFinite(vv) && vv > 0 ? vv : 0;
  }
  return 1;
}

export const treemap = createNodeOperator(
  (opts: TreemapProps, children: GoFishAST[]) => {
    const {
      name,
      key,
      paddingInner = 0,
      paddingOuter = 0,
      round = true,
      tile = "squarify",
      sort = "desc",
      valueField,
      value,
      ...fancyDims
    } = opts;

    const dims = elaborateDims(fancyDims);

    return new GoFishNode(
      {
        type: "treemap",
        args: {
          key,
          name,
          paddingInner,
          paddingOuter,
          round,
          tile,
          sort,
          valueField,
          dims,
        },
        key,
        name,
        shared: [false, false],
        resolveUnderlyingSpace: (): Size<UnderlyingSpace> => {
          // Treemap is inherently positioned in both axes within its allotted box.
          // Use a stable unit domain; this avoids implying ordinal semantics.
          return [POSITION(interval(0, 1)), POSITION(interval(0, 1))];
        },
        layout: (_shared, size, scaleFactors, childAsts, posScales, node) => {
          const xPos = computeAesthetic(
            dims[0].min,
            posScales?.[0]!,
            undefined
          );
          const yPos = computeAesthetic(
            dims[1].min,
            posScales?.[1]!,
            undefined
          );

          const resolvedSize: Size = [
            computeSize(dims[0].size, scaleFactors?.[0]!, size[0]),
            computeSize(dims[1].size, scaleFactors?.[1]!, size[1]),
          ];

          const session = node.getRenderSession();
          const scaleContext = session.scaleContext;
          scaleContext.x = {
            domain: [0, resolvedSize[0] / (scaleFactors[0] ?? 1)],
            scaleFactor: scaleFactors[0] ?? 1,
          };
          scaleContext.y = {
            domain: [0, resolvedSize[1] / (scaleFactors[1] ?? 1)],
            scaleFactor: scaleFactors[1] ?? 1,
          };

          // Build weights and hierarchy (single level: the passed-in children).
          const leafData: LeafDatum[] = childAsts.map((child, i) => ({
            i,
            weight: resolveWeightFromChild(child, { value, valueField }),
          }));

          // Ensure total > 0 so d3 doesn't produce NaNs.
          const total = leafData.reduce((acc, d) => acc + d.weight, 0);
          if (total <= 0) {
            for (const d of leafData) d.weight = 1;
          }

          const root = hierarchy<{ children: LeafDatum[] }>(
            { children: leafData },
            (d) => d.children
          ).sum((d: any) =>
            typeof d.weight === "number" ? d.weight : 0
          ) as HierarchyNode<any>;

          if (sort !== "none") {
            root.sort((a, b) =>
              sort === "asc"
                ? (a.value ?? 0) - (b.value ?? 0)
                : (b.value ?? 0) - (a.value ?? 0)
            );
          }

          const treemapLayout = d3Treemap<any>()
            .size([resolvedSize[0], resolvedSize[1]])
            .paddingInner(paddingInner)
            .paddingOuter(paddingOuter)
            .round(round);

          // Keep default squarify unless we explicitly choose something else.
          if (tile === "slice") treemapLayout.tile(treemapSlice);
          else if (tile === "dice") treemapLayout.tile(treemapDice);

          const rectRoot = treemapLayout(root) as HierarchyRectangularNode<any>;
          const leaves = rectRoot.leaves();

          if (childAsts.length === 0) {
            return {
              intrinsicDims: {
                0: { min: 0, size: 0, center: 0, max: 0 },
                1: { min: 0, size: 0, center: 0, max: 0 },
              },
              transform: { translate: { 0: undefined, 1: undefined } },
            };
          }

          const placed: Placeable[] = new Array(childAsts.length);
          for (const leaf of leaves) {
            const data = leaf.data as LeafDatum;
            const i = data.i;
            const x0 = leaf.x0 ?? 0;
            const y0 = leaf.y0 ?? 0;
            const x1 = leaf.x1 ?? x0;
            const y1 = leaf.y1 ?? y0;
            const w = Math.max(0, x1 - x0);
            const h = Math.max(0, y1 - y0);

            const child = childAsts[i];
            const placeable = child.layout([w, h], scaleFactors, posScales);
            placeable.place(0, x0 + w / 2, "center");
            placeable.place(1, y0 + h / 2, "center");
            placed[i] = placeable;
          }

          const xMin = Math.min(...placed.map((c) => c.dims[0].min!));
          const xMax = Math.max(...placed.map((c) => c.dims[0].max!));
          const yMin = Math.min(...placed.map((c) => c.dims[1].min!));
          const yMax = Math.max(...placed.map((c) => c.dims[1].max!));

          return {
            intrinsicDims: {
              0: {
                min: xMin,
                size: xMax - xMin,
                center: (xMin + xMax) / 2,
                max: xMax,
              },
              1: {
                min: yMin,
                size: yMax - yMin,
                center: (yMin + yMax) / 2,
                max: yMax,
              },
            },
            transform: {
              translate: {
                0: xPos !== undefined ? xPos - xMin : undefined,
                1: yPos !== undefined ? yPos - yMin : undefined,
              },
            },
          };
        },
        render: ({ transform }, renderedChildren) => {
          return (
            <g
              transform={`translate(${transform?.translate?.[0] ?? 0}, ${transform?.translate?.[1] ?? 0})`}
            >
              {renderedChildren}
            </g>
          );
        },
      },
      children
    );
  }
);
