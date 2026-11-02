// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

import {
  hierarchy,
  treemap as d3Treemap,
  treemapDice,
  treemapSlice,
  treemapBinary,
  treemapSquarify,
} from "d3-hierarchy";

import { GoFishNode, nestEach } from "../_node";
import { GoFishAST } from "../_ast";
import { createNodeOperator } from "../withGoFish";
import {
  FancyDims,
  Size,
  Direction,
  MARK_DIMS,
  elaborateOwnDims,
} from "../dims";
import {
  fieldNameOf,
  getQuantity,
  getValue,
  isValue,
  MaybeValue,
} from "../data";
import { computeAesthetic, computeSize } from "../../util";
import { posFn, pxOf } from "../domain";
import { UnderlyingSpace, UNDEFINED, magnitude } from "../underlyingSpace";
import * as Interval from "../../util/interval";
import * as Pwl from "../solver/pwl";
import { rejectLength, type LengthValue } from "../length";
import { createOperator } from "../marks/createOperator";
import { SplitBy, splitEntries } from "../datumProjection";
import type { FieldExpr } from "../fieldExpr";
import { checkSummable } from "../measure";
import { squarify, type Tile } from "../../families/tile";
import { Frontend } from "gofish-ir";
import { insetConvex } from "../geometry/clip";
import {
  boxRing,
  inItsBox,
  isWholeBox,
  ringCentroid,
  type Ring,
} from "../geometry/ring";
import { voronoiTiling } from "../geometry/voronoiTiling";

/** What a tiling reads from the treemap: its options, the size of its box,
 *  and how an error message names it (`where`). */
type TilingOptions = {
  spacing: number;
  padding: number;
  round: boolean;
  size: Size;
  where: string;
};

/**
 * A tiling: the cells of a region, one per weight, each with its weight's
 * share of the region's area, in weight order and in the treemap's frame.
 * `region` is the shape the treemap fills, or `undefined` for its whole box
 * `[0, size[0]] × [0, size[1]]`. Every `Tile` strategy names one
 * (`tiling`), and the treemap lays its children out in the cells the same
 * way whatever the strategy.
 */
type Tiling = (
  region: Ring | undefined,
  weights: readonly number[],
  options: TilingOptions
) => Ring[];

/** A rectangular tiling: one of d3-hierarchy's methods, which tile a box. */
type RectTile = Exclude<Tile, { kind: "voronoi" }>;

const D3_TILES = {
  squarify: treemapSquarify,
  slice: treemapSlice,
  dice: treemapDice,
  binary: treemapBinary,
} satisfies Record<RectTile["kind"], unknown>;

/** The d3 tiling method of a rectangular `Tile` strategy (a squarify ratio
 *  of at least 1 is checked with its family, since d3 would clamp it
 *  silently). */
const d3Tile = (tile: RectTile) =>
  tile.kind === "squarify" && tile.ratio !== undefined
    ? treemapSquarify.ratio(tile.ratio)
    : D3_TILES[tile.kind];

/** `Tile.voronoi()`'s seed when it is given none, as the `Tile` family
 *  declares it. */
const VORONOI_SEED = Frontend.STRATEGIES.Tile.kinds.voronoi.params.seed
  .default as number;

/** The spelling of a tiling in an error message: `Tile.squarify`. */
const tileName = (tile: Tile) => `Tile.${tile.kind}`;

/** A rectangular tiling: d3 tiles the box, `padding` in from its edge and
 *  `spacing` between siblings, and each tile is a box ring. It tiles only a
 *  box: in any other shape its tiles would not have the areas their weights
 *  give them. */
const d3Tiling =
  (tile: RectTile): Tiling =>
  (region, weights, { spacing, padding, round, size, where }) => {
    if (!isWholeBox(region, size[0], size[1]))
      throw new Error(
        `${where}: ${tileName(tile)} needs a rectangular region, but this ` +
          `treemap sits in a shape that is not a box (a Voronoi cell, an ` +
          `oval, or a polygon cell of a partition). Use Tile.voronoi here.`
      );
    // d3 keeps its children in the order given (there is no `.sort`), so
    // leaf `k` is weight `k`. Its tiles are in the treemap's own axis
    // order, like any operator's: top-down in free space, upward in a chart.
    type Datum = { k: number; children?: Datum[] };
    const root = hierarchy<Datum>({
      k: -1,
      children: weights.map((_, k) => ({ k })),
    }).sum((d) => (d.k >= 0 ? weights[d.k] : 0));
    const leaves = d3Treemap<Datum>()
      .size([size[0], size[1]])
      .paddingInner(spacing)
      .paddingOuter(padding)
      .round(round)
      .tile(d3Tile(tile))(root)
      .leaves();
    const rings: Ring[] = new Array(weights.length);
    for (const { x0, y0, x1, y1, data } of leaves) {
      const right = Math.max(x0, x1);
      const bottom = Math.max(y0, y1);
      rings[data.k] = [
        [x0, y0],
        [right, y0],
        [right, bottom],
        [x0, bottom],
      ];
    }
    return rings;
  };

/** The Voronoi tiling: one convex cell per weight (`voronoiTiling`), in the
 *  region drawn in by the padding, with siblings `spacing` apart; the
 *  spacing leaves the region's own edges alone, as d3's paddingInner does. */
const voronoiTilingOf =
  (seed: number): Tiling =>
  (region, weights, { spacing, padding, size, where }) => {
    const whole = region ?? boxRing(size[0], size[1]);
    const inset = padding > 0 ? insetConvex(whole, padding) : whole;
    if (inset === undefined)
      throw new Error(
        `${where}: Tile.voronoi needs a convex region, and the shape this ` +
          `treemap is in is not convex.`
      );
    return voronoiTiling(inset, weights, seed, spacing);
  };

/** The tiling a `Tile` strategy names. */
const tiling = (tile: Tile): Tiling =>
  tile.kind === "voronoi"
    ? voronoiTilingOf(tile.seed ?? VORONOI_SEED)
    : d3Tiling(tile);

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
} & FancyDims<MaybeValue<number> | LengthValue>;

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

/** A treemap as an error message names it: by the field its children are
 *  split by, which each child records (`keyBy`). */
const where = (children: readonly GoFishAST[]): string => {
  const by = fieldNameOf((children[0] as GoFishNode | undefined)?.keyBy);
  return by === undefined ? "treemap" : `treemap (by "${by}")`;
};

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

    // A length for its own size (`w: percent(50)`, `w: fr(2)`) is laid out
    // in the room it is given, once it is in its tree (#1176 step 6).
    const own = elaborateOwnDims<MaybeValue<number>>(fancyDims);
    const { dims } = own;
    // Its spacing and padding are one number d3 applies on both axes, so a
    // percent has no one room to be a percent of.
    // TODO(#1176): a percent treemap spacing needs the axis it is of (the
    // smaller side, or each axis on its own), a design question.
    rejectLength("treemap's spacing", spacing);
    rejectLength("treemap's padding", padding);
    // A tile's area is its entry's share of the total, so the treemap adds
    // its entries: their unit must add up (`checkSummable`, #1197). It is
    // checked once here, so the layout below sums the weights as they are.
    checkSummable(
      sizeChannel?.map(getQuantity).find((q) => q !== undefined),
      "treemap({ size })"
    );

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
        // The treemap sizes each child from data into a tile of its own, so
        // on both axes each child is detached from the others and nested in
        // its tile, as a grid cell is.
        resolveSharing: nestEach,
        resolveUnderlyingSpace: (): Size<UnderlyingSpace> => {
          // Mirror Spread's explicit-size handling (spread.tsx:123-131): when a
          // data-driven size is declared on an axis (e.g. `h: "fare"` auto-summed
          // to a Value), emit SIZE so the parent faceting spread can co-solve a
          // scale shared across sibling treemaps. Otherwise the treemap orders
          // nothing along the axis by data: it has no axis there and fills the
          // slot it is given.
          const axisSpace = (i: Direction): UnderlyingSpace => {
            const size = own.dataSize(i);
            return isValue(size) ? magnitude(size) : UNDEFINED;
          };
          return [axisSpace(0), axisSpace(1)];
        },
        layout: (size, scales, childAsts, node, shape) => {
          const xPos = computeAesthetic(
            dims[0].min,
            posFn(scales?.[0]?.map),
            undefined
          );
          const yPos = computeAesthetic(
            dims[1].min,
            posFn(scales?.[1]?.map),
            undefined
          );

          // Re-solve a local scale factor from this node's own size claim,
          // mirroring Spread.computeScaleFactor (spread.tsx:242-259). Used as a
          // fallback for the standalone (non-faceted) data-driven case.
          const myExtent = node.resolveExtent();
          const localScaleFactor = (dir: Direction): number | undefined => {
            const extent = myExtent[dir];
            if (extent !== undefined) {
              return Pwl.solve(extent.width, size[dir]) ?? 0;
            }
            return undefined;
          };

          // Treemap box size per axis (the [w, h] handed to d3-treemap):
          //  - no size      -> fill the slot the parent gave (size[dir]), as a
          //    length that is a share of its scope does (`fixedSize`).
          //  - numeric size -> that many px (computeSize literal branch), as a
          //    length whose room is known is.
          //  - data-driven  -> if a shared posScale exists on this axis (the
          //    faceting parent composed POSITION[0,maxV] across siblings), map
          //    the value through it so all facets share one scale; otherwise
          //    solve our own factor and multiply.
          const resolveAxisSize = (dir: Direction): number => {
            const declared = node.fixedSize(dir);
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

          Frontend.checkStrategy("Tile", tile, "treemap({ tile })");
          if (childAsts.length === 0) {
            return {
              intrinsicDims: {
                0: { min: 0, size: 0 },
                1: { min: 0, size: 0 },
              },
              transform: { translate: { 0: undefined, 1: undefined } },
            };
          }

          // Build weights (single level: the passed-in children).
          const leafData: LeafDatum[] = childAsts.map((_child, i) => ({
            i,
            weight: resolveWeight(sizeChannel, i),
          }));

          // Ensure total > 0 so the tiling doesn't produce NaNs.
          const total = leafData.reduce((acc, d) => acc + d.weight, 0);
          if (total <= 0) {
            for (const d of leafData) d.weight = 1;
          }

          // The shape it fills (#1222, `geometry/ring.ts`): the shape it is
          // handed, when it has no size of its own and so fills its space,
          // else its box.
          const fills =
            node.fixedSize(0) === undefined && node.fixedSize(1) === undefined;
          const region = fills ? shape : undefined;

          // The order the tiling lays the children out in. The sort is
          // stable, so equal weights keep their child order.
          if (sort !== "none")
            leafData.sort((a, b) =>
              sort === "asc" ? a.weight - b.weight : b.weight - a.weight
            );

          // One cell per child, in the treemap's frame, in weight order.
          const cells = tiling(tile)(
            region,
            leafData.map((d) => d.weight),
            {
              spacing,
              padding,
              round,
              size: resolvedSize,
              where: where(childAsts),
            }
          );

          // Each child is laid out in its cell's box, with its cell as its
          // shape, and placed at the box's center.
          leafData.forEach(({ i }, k) => {
            const ring = cells[k];
            if (ring.length < 3) {
              // A child with no area left sits at the region's center.
              const center = ringCentroid(
                region ?? boxRing(resolvedSize[0], resolvedSize[1])
              );
              const placeable = childAsts[i].layout([0, 0], scales);
              placeable.place(0, center[0], "center");
              placeable.place(1, center[1], "center");
              return;
            }
            const box = inItsBox(ring);
            const placeable = childAsts[i].layout(box.size, scales, box.ring);
            placeable.place(0, box.at[0] + box.size[0] / 2, "center");
            placeable.place(1, box.at[1] + box.size[1] / 2, "center");
          });

          // Its box is the region it was given, `[0, w] × [0, h]`, whatever
          // the tiling. The padding is an inset at the treemap's own edge,
          // inside that box, and the box is the frame its shape is in, so a
          // parent that centers it there centers its shape.
          return {
            intrinsicDims: {
              0: { min: 0, size: resolvedSize[0] },
              1: { min: 0, size: resolvedSize[1] },
            },
            transform: { translate: { 0: xPos, 1: yPos } },
          };
        },
      },
      children
    );
    // The treemap's own box is named by axis in `dims` like a mark's; `bind`
    // defers it to the resolveAliases pass.
    own.bind(node);
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
    split: ({ by }, d) => splitEntries(by, d),
    channels: {
      w: "size",
      h: "size",
      // Each `dims` slot infers as its top-level counterpart (`size` as w/h).
      dims: { type: "dims", form: MARK_DIMS },
      size: { type: "size", entry: true },
    } as any,
  }
);
