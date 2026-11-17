/**
 * The `Tiling` family: the tiling strategies of `tile`'s `method` option.
 *
 * `lib.ts` binds this module as `Tiling` (`Tiling.squarify({ ratio: 1 })`), and
 * `gofish-graphics/tiling` exports the same module. No kind has a required
 * option, so each is a value as it is, and calling it sets options:
 * `Tiling.squarify` is `Tiling.squarify()` (#1133, `ast/strategyKind.ts`). A
 * strategy is a plain object, `{ kind, ...params }`, and that object is also its
 * wire form, so it crosses the Python bridge as IR. `kind` names the strategy.
 * The rectangular kinds (squarify, slice, dice, binary) are d3-hierarchy's
 * tiling methods and need a rectangular region; `voronoi` tiles any convex
 * region (`ast/geometry/voronoiTiling.ts`). The kinds and their params are
 * declared once, in gofish-ir's `STRATEGIES` table, which checks a strategy
 * where `tile` reads it.
 */
import type { Frontend } from "gofish-ir";
import { bareKind } from "../ast/strategyKind";

/**
 * How `tile` tiles its region: the value of its `method` option.
 */
export type Tiling = Frontend.TilingIR;

/** The tiling of kind `K`. */
type Kind<K extends Tiling["kind"]> = Extract<Tiling, { kind: K }>;

/**
 * Squarified tiling (d3's `treemapSquarify`): makes tiles as close as it can to
 * the aspect `ratio`: the longer side over the shorter side, so it is at least
 * 1 and does not pick an orientation. Omitted, `ratio` is d3's default, the
 * golden ratio. `ratio: 1` aims for square tiles, which suits one circle per
 * leaf.
 */
export const squarify = bareKind(
  "Tiling.squarify",
  ({ ratio }: { ratio?: number } = {}): Kind<"squarify"> => ({
    kind: "squarify",
    ratio,
  })
);

/** Lay the tiles out in one column, stacked along y (d3's `treemapSlice`). */
export const slice = bareKind(
  "Tiling.slice",
  (): Kind<"slice"> => ({ kind: "slice" })
);

/** Lay the tiles out in one row, side by side along x (d3's `treemapDice`). */
export const dice = bareKind(
  "Tiling.dice",
  (): Kind<"dice"> => ({ kind: "dice" })
);

/** Split the tiles into two halves of near-equal weight, recursively (d3's
 *  `treemapBinary`). */
export const binary = bareKind(
  "Tiling.binary",
  (): Kind<"binary"> => ({ kind: "binary" })
);

/**
 * Voronoi tiling (#1222): cut the region into convex cells with rounded,
 * irregular shapes, each with an area proportional to its weight, by a
 * weighted Voronoi diagram (a power diagram) whose sites and weights are
 * adjusted until the areas match (Nocaj and Brandes 2012). It tiles any
 * convex region: the `tile`'s box, a Voronoi cell of a `tile` around it,
 * or the oval of an `enclose` around it, so its cells can hold another
 * Voronoi level. The sites start at random positions drawn from `seed`, so
 * the same seed draws the same cells. Default seed 0.
 */
export const voronoi = bareKind(
  "Tiling.voronoi",
  ({ seed }: { seed?: number } = {}): Kind<"voronoi"> => ({
    kind: "voronoi",
    seed,
  })
);
