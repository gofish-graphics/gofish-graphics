/**
 * The `Tile` family: the tiling strategies of `treemap`'s `tile` option.
 *
 * `lib.ts` binds this module as `Tile` (`Tile.squarify({ ratio: 1 })`), and
 * `gofish-graphics/tile` exports the same module. A strategy is a plain object
 * made by a function call, `{ kind, ...params }`, and that object is also its
 * wire form, so it crosses the Python bridge as IR. `kind` names the strategy;
 * each maps to one of d3-hierarchy's tiling methods. The kinds and their
 * params are declared once, in gofish-ir's `STRATEGIES` table, which checks a
 * strategy where `treemap` reads it.
 */
import type { Frontend } from "gofish-ir";

/**
 * How `treemap` tiles its box: the value of its `tile` option.
 */
export type Tile = Frontend.TileIR;

/**
 * Squarified tiling (d3's `treemapSquarify`): makes tiles as close as it can to
 * the aspect `ratio`: the longer side over the shorter side, so it is at least
 * 1 and does not pick an orientation. Omitted, `ratio` is d3's default, the
 * golden ratio. `ratio: 1` aims for square tiles, which suits one circle per
 * leaf.
 */
export const squarify = ({ ratio }: { ratio?: number } = {}): Tile => ({
  kind: "squarify",
  ratio,
});

/** Lay the tiles out in one column, stacked along y (d3's `treemapSlice`). */
export const slice = (): Tile => ({ kind: "slice" });

/** Lay the tiles out in one row, side by side along x (d3's `treemapDice`). */
export const dice = (): Tile => ({ kind: "dice" });

/** Split the tiles into two halves of near-equal weight, recursively (d3's
 *  `treemapBinary`). */
export const binary = (): Tile => ({ kind: "binary" });

/** Alternate slice and dice by depth (d3's `treemapSliceDice`). */
export const sliceDice = (): Tile => ({ kind: "sliceDice" });
