import {
  hierarchy,
  treemap as d3Treemap,
  treemapDice,
  treemapSlice,
  treemapBinary,
  treemapSliceDice,
  treemapSquarify,
} from "d3-hierarchy";
import type { HierarchyNode, HierarchyRectangularNode } from "d3-hierarchy";

import { GoFishNode, Placeable } from "../_node";
import { GoFishAST } from "../_ast";
import { createNodeOperator } from "../withGoFish";
import {
  FancyDims,
  Size,
  Direction,
  elaborateDims,
  translateString,
} from "../dims";
import { getMeasure, getValue, isValue, MaybeValue } from "../data";
import { computeAesthetic, computeSize } from "../../util";
import {
  POSITION,
  SIZE,
  isCONTINUOUS,
  UnderlyingSpace,
} from "../underlyingSpace";
import { interval } from "../../util/interval";
import * as Interval from "../../util/interval";
import * as Monotonic from "../../util/monotonic";
import { createOperator } from "../marks/createOperator";

type TreemapTile =
  | "squarify"
  | "slice"
  | "dice"
  | "binary"
  | "slicedice"
  | "squarifyCircle";
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
  /** When true, mirror leaf layout top-to-bottom within the treemap box (SVG y grows downward). */
  flipY?: boolean;
  /**
   * When set, each leaf is laid out in a square of side `min(leafW, leafH, 2*datum[field])`
   * so mark size can follow a **global** scale across facets. Default fills the full leaf
   * rectangle (`[w,h]`).
   */
  leafIntrinsicRadiusField?: string;
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

export const Treemap = createNodeOperator(
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
      flipY = false,
      leafIntrinsicRadiusField,
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
          flipY,
          leafIntrinsicRadiusField,
          dims,
        },
        key,
        name,
        shared: [false, false],
        resolveUnderlyingSpace: (): Size<UnderlyingSpace> => {
          // Mirror Spread's explicit-size handling (spread.tsx:123-131): when a
          // data-driven size is declared on an axis (e.g. `h: "fare"` auto-summed
          // to a Value), emit SIZE so the parent faceting spread can co-solve a
          // scale shared across sibling treemaps. Otherwise the treemap is a
          // positioned box that fills the slot it is given.
          const axisSpace = (i: Direction): UnderlyingSpace =>
            isValue(dims[i].size)
              ? SIZE(
                  Monotonic.linear(getValue(dims[i].size!)!, 0),
                  getMeasure(dims[i].size)
                )
              : POSITION(interval(0, 1));
          return [axisSpace(0), axisSpace(1)];
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

          // Re-solve a local scale factor from this node's own underlying space,
          // mirroring Spread.computeScaleFactor (spread.tsx:242-259). Used as a
          // fallback for the standalone (non-faceted) data-driven case.
          const myUSpace = node._underlyingSpace!;
          const localScaleFactor = (dir: Direction): number | undefined => {
            const space = myUSpace[dir];
            if (isCONTINUOUS(space)) {
              return (
                space.width.inverse(size[dir], {
                  upperBoundGuess: size[dir],
                }) ?? 0
              );
            }
            return undefined;
          };

          // Treemap box size per axis (the [w, h] handed to d3-treemap):
          //  - no size      -> fill the slot the parent gave (size[dir]).
          //  - numeric size -> that many px (computeSize literal branch).
          //  - data-driven  -> if a shared posScale exists on this axis (the
          //    faceting parent composed POSITION[0,maxV] across siblings), map
          //    the value through it so all facets share one scale; otherwise
          //    solve our own factor and multiply.
          const resolveAxisSize = (dir: Direction): number => {
            const declared = dims[dir].size;
            if (declared === undefined) return size[dir];
            if (!isValue(declared)) {
              return computeSize(
                declared,
                scaleFactors?.[dir] ?? 1,
                size[dir]
              ) as number;
            }
            const v = getValue(declared)!;
            const posScale = posScales?.[dir];
            if (posScale) return posScale(v) - posScale(0);
            const sf = scaleFactors?.[dir] ?? localScaleFactor(dir) ?? 1;
            return v * sf;
          };

          const resolvedSize: Size = [resolveAxisSize(0), resolveAxisSize(1)];

          const sfX = scaleFactors?.[0] ?? localScaleFactor(0) ?? 1;
          const sfY = scaleFactors?.[1] ?? localScaleFactor(1) ?? 1;

          const session = node.getRenderSession();
          const scaleContext = session.scaleContext;
          scaleContext.x = {
            domain: [0, resolvedSize[0] / sfX],
            scaleFactor: sfX,
          };
          scaleContext.y = {
            domain: [0, resolvedSize[1] / sfY],
            scaleFactor: sfY,
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

          type TreemapDatum = { children?: LeafDatum[] } | LeafDatum;
          const root = hierarchy<TreemapDatum>(
            { children: leafData } as TreemapDatum,
            (d) => ("children" in d ? d.children : undefined)
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
          else if (tile === "binary") treemapLayout.tile(treemapBinary);
          else if (tile === "slicedice") treemapLayout.tile(treemapSliceDice);
          else if (tile === "squarifyCircle")
            treemapLayout.tile(treemapSquarify.ratio(1));

          const rectRoot = treemapLayout(root) as HierarchyRectangularNode<any>;
          const leaves = rectRoot.leaves();

          if (childAsts.length === 0) {
            return {
              intrinsicDims: {
                0: { min: 0, size: 0 },
                1: { min: 0, size: 0 },
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
            let lw = w;
            let lh = h;
            if (leafIntrinsicRadiusField && child instanceof GoFishNode) {
              const datum = (child as GoFishNode & { datum?: unknown }).datum;
              const d = datum as Record<string, unknown> | undefined;
              const rad = Number(d?.[leafIntrinsicRadiusField]);
              if (Number.isFinite(rad) && rad > 0) {
                const side = Math.min(2 * rad, w, h);
                lw = side;
                lh = side;
              }
            }
            const placeable = child.layout([lw, lh], scaleFactors, posScales);
            placeable.place(0, x0 + w / 2, "center");
            const cy = flipY ? resolvedSize[1] - (y0 + h / 2) : y0 + h / 2;
            placeable.place(1, cy, "center");
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
              },
              1: {
                min: yMin,
                size: yMax - yMin,
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
            <g transform={translateString(transform)}>{renderedChildren}</g>
          );
        },
      },
      children
    );
  }
);

export const treemap = createOperator<any, TreemapProps>(
  (props: TreemapProps, children: GoFishAST[]) => Treemap(props, children),
  {
    split: ({ name }, d) => new Map(d.map((r, i) => [i, r])),
    channels: {
      w: "size",
      h: "size",
    } as any,
  }
);
