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
  MARK_DIMS,
  deferAxisDims,
  elaborateDims,
} from "../dims";
import { chunk, getValue, isValue, MaybeValue } from "../data";
import { computeAesthetic, computeSize } from "../../util";
import { posFn, pxOf } from "../domain";
import { UnderlyingSpace, UNDEFINED, magnitude } from "../underlyingSpace";
import * as Interval from "../../util/interval";
import { createOperator } from "../marks/createOperator";
import { SplitBy, splitEntries } from "../datumProjection";
import type { FieldExpr } from "../fieldExpr";
import { squarify, type Tile } from "../../families/tile";
import { Frontend } from "gofish-ir";

const D3_TILES = {
  squarify: treemapSquarify,
  slice: treemapSlice,
  dice: treemapDice,
  binary: treemapBinary,
  sliceDice: treemapSliceDice,
} satisfies Record<Tile["kind"], unknown>;

/** The d3 tiling method of a `Tile` strategy, checked against its family
 *  (a known kind; a squarify ratio of at least 1, which d3 would clamp
 *  silently). */
function d3Tile(tile: Tile) {
  Frontend.checkStrategy("Tile", tile, "treemap({ tile })");
  return tile.kind === "squarify" && tile.ratio !== undefined
    ? treemapSquarify.ratio(tile.ratio)
    : D3_TILES[tile.kind];
}

type TreemapSort = "asc" | "desc" | "none";

type TreemapProps = {
  key?: string;
  /** Gap between sibling tiles, in pixels. Default 0. */
  spacing?: number;
  /** Inset around the outer edge of the treemap, in pixels. Default 0. */
  padding?: number;
  round?: boolean;
  /** The tiling strategy. Default `Tile.squarify()`. */
  tile?: Tile;
  sort?: TreemapSort;
  /** Per-entry weight driving each leaf's tile area — one value per child, in
   *  child order (mirrors `spread`'s entry-flagged `size`, #700-style). */
  size?: MaybeValue<number>[];
} & FancyDims<MaybeValue<number>>;

type LeafDatum = {
  i: number;
  weight: number;
};

function resolveWeight(
  size: MaybeValue<number>[] | undefined,
  i: number
): number {
  if (!size) return 1;
  const v = size[i];
  if (v === undefined) return 1;
  const num = isValue(v) ? Number(getValue(v)) : Number(v);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

const Treemap = createNodeOperator(
  (opts: TreemapProps, children: GoFishAST[]) => {
    const {
      key,
      spacing = 0,
      padding = 0,
      round = true,
      tile = squarify(),
      sort = "desc",
      size: sizeChannel,
      ...fancyDims
    } = opts;

    const dims = elaborateDims(fancyDims);

    const node = new GoFishNode(
      {
        type: "treemap",
        args: {
          key,
          spacing,
          padding,
          round,
          tile,
          sort,
          size: sizeChannel,
          dims,
        },
        key,
        shared: [false, false],
        resolveUnderlyingSpace: (): Size<UnderlyingSpace> => {
          // Mirror Spread's explicit-size handling (spread.tsx:123-131): when a
          // data-driven size is declared on an axis (e.g. `h: "fare"` auto-summed
          // to a Value), emit SIZE so the parent faceting spread can co-solve a
          // scale shared across sibling treemaps. Otherwise the treemap orders
          // nothing along the axis by data: it has no axis there and fills the
          // slot it is given.
          const axisSpace = (i: Direction): UnderlyingSpace =>
            isValue(dims[i].size) ? magnitude(dims[i].size) : UNDEFINED;
          return [axisSpace(0), axisSpace(1)];
        },
        layout: (_shared, size, scales, childAsts, node) => {
          const xPos = computeAesthetic(
            dims[0].min,
            posFn(scales?.[0]?.map)!,
            undefined
          );
          const yPos = computeAesthetic(
            dims[1].min,
            posFn(scales?.[1]?.map)!,
            undefined
          );

          // Re-solve a local scale factor from this node's own size claim,
          // mirroring Spread.computeScaleFactor (spread.tsx:242-259). Used as a
          // fallback for the standalone (non-faceted) data-driven case.
          const myExtent = node.resolveExtent();
          const localScaleFactor = (dir: Direction): number | undefined => {
            const extent = myExtent[dir];
            if (extent !== undefined) {
              return (
                extent.width.inverse(size[dir], {
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
                scales?.[dir]?.sigma ?? 1,
                size[dir]
              ) as number;
            }
            const v = getValue(declared)!;
            const map = scales?.[dir]?.map;
            if (map) return pxOf(map, v) - pxOf(map, 0);
            const sf = scales?.[dir]?.sigma ?? localScaleFactor(dir) ?? 1;
            return v * sf;
          };

          const resolvedSize: Size = [resolveAxisSize(0), resolveAxisSize(1)];

          const sfX = scales?.[0]?.sigma ?? localScaleFactor(0) ?? 1;
          const sfY = scales?.[1]?.sigma ?? localScaleFactor(1) ?? 1;

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
          const leafData: LeafDatum[] = childAsts.map((_child, i) => ({
            i,
            weight: resolveWeight(sizeChannel, i),
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
            .paddingInner(spacing)
            .paddingOuter(padding)
            .round(round)
            .tile(d3Tile(tile));

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

            const placeable = childAsts[i].layout([w, h], scales);
            // d3's tiles are placed in the treemap's own axis order, like
            // any operator's: top-down in free space, upward in a chart.
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
      },
      children
    );
    // The treemap's own box is named by axis in `dims` like a mark's; defer it
    // to the resolveAliases pass.
    node._elaborateInAxisScope = deferAxisDims(fancyDims, dims);
    return node;
  }
);

export type TreemapOptions<T = any> = Omit<TreemapProps, "size"> & {
  /** Field to partition rows by (like `spread`/`group`); also accepts a
   *  `field(...)` accessor carrying domain ops (sort/reverse/bin/dropNulls).
   *  Without `by`, one leaf is emitted per row (identity split). */
  by?: SplitBy;
  /** Per-leaf weight driving tile area: a field name, a field expression, or
   *  an explicit per-entry array — mirrors `spread`'s entry-flagged `size`.
   *  `inferSize` sums by default for a bare field name, so `size:
   *  "Worldwide Gross"` aggregates per group. */
  size?: (keyof T & string) | FieldExpr | MaybeValue<number>[];
};

export const treemap = createOperator<any, TreemapOptions>(
  ((props: TreemapProps, children: GoFishAST[]) =>
    Treemap(props, children)) as any,
  {
    // Without `by`, the split is by row identity, `chunk(1)`: one group
    // `[item]` per item, keyed by position (see `splitEntries`).
    split: ({ by }, d) => splitEntries(by ?? chunk(1), d),
    channels: {
      w: "size",
      h: "size",
      // Each `dims` slot infers as its top-level counterpart (`size` as w/h).
      dims: { type: "dims", form: MARK_DIMS },
      size: { type: "size", entry: true },
    } as any,
  }
);
