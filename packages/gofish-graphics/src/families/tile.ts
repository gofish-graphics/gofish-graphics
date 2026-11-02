/**
 * The `Tile` family: the tiling strategies of `treemap`'s `tile` option.
 *
 * `lib.ts` binds this module as `Tile` (`Tile.squarify({ ratio: 1 })`), and
 * `gofish-graphics/tile` exports the same module. No kind has a required
 * option, so each is a value as it is, and calling it sets options:
 * `Tile.squarify` is `Tile.squarify()` (#1133, `ast/strategyKind.ts`). A
 * strategy is a plain object, `{ kind, ...params }`, and that object is also its
 * wire form, so it crosses the Python bridge as IR. `kind` names the strategy.
 * The rectangular kinds (squarify, slice, dice, binary) are d3-hierarchy's
 * tiling methods and need a rectangular region; `voronoi` tiles any convex
 * region (`ast/geometry/voronoiTiling.ts`). The kinds and their params are
 * declared once, in gofish-ir's `STRATEGIES` table, which checks a strategy
 * where `treemap` reads it.
 */
import type { Frontend } from "gofish-ir";
import { bareKind } from "../ast/strategyKind";

/**
 * How `treemap` tiles its region: the value of its `tile` option.
 */
export type Tile = Frontend.TileIR;

/** The tiling of kind `K`. */
type Kind<K extends Tile["kind"]> = Extract<Tile, { kind: K }>;

/**
 * Squarified tiling (d3's `treemapSquarify`): makes tiles as close as it can to
 * the aspect `ratio`: the longer side over the shorter side, so it is at least
 * 1 and does not pick an orientation. Omitted, `ratio` is d3's default, the
 * golden ratio. `ratio: 1` aims for square tiles, which suits one circle per
 * leaf.
 */
export const squarify = bareKind(
  "Tile.squarify",
  ({ ratio }: { ratio?: number } = {}): Kind<"squarify"> => ({
    kind: "squarify",
    ratio,
  })
);

/** Lay the tiles out in one column, stacked along y (d3's `treemapSlice`). */
export const slice = bareKind(
  "Tile.slice",
  (): Kind<"slice"> => ({ kind: "slice" })
);

/** Lay the tiles out in one row, side by side along x (d3's `treemapDice`). */
export const dice = bareKind(
  "Tile.dice",
  (): Kind<"dice"> => ({ kind: "dice" })
);

/** Split the tiles into two halves of near-equal weight, recursively (d3's
 *  `treemapBinary`). */
export const binary = bareKind(
  "Tile.binary",
  (): Kind<"binary"> => ({ kind: "binary" })
);

/**
 * Voronoi tiling (#1222): cut the region into convex cells with rounded,
 * irregular shapes, each with an area proportional to its weight, by a
 * weighted Voronoi diagram (a power diagram) whose sites and weights are
 * adjusted until the areas match (Nocaj and Brandes 2012). It tiles any
 * convex region: the treemap's box, a Voronoi cell of a treemap around it,
 * or the oval of an `enclose` around it, so its cells can hold another
 * Voronoi level. The sites start at random positions drawn from `seed`, so
 * the same seed draws the same cells. Default seed 0.
 */
export const voronoi = bareKind(
  "Tile.voronoi",
  ({ seed }: { seed?: number } = {}): Kind<"voronoi"> => ({
    kind: "voronoi",
    seed,
  })
);
