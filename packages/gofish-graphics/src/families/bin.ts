// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * The `Bin` family: the cells a key is binned into (#1058, #1059, #48).
 * `Bin.step(size)`, `Bin.thresholds(countOrEdges)` and
 * `Bin.quantiles(countOrProbabilities)` cut the line of one field into
 * intervals, the value of `field(x).bin(...)`; `Bin.hex({ radius })`
 * and `Bin.voronoi({ seeds })` divide the plane of two fields into polygons,
 * the value of `struct({ x, y }).bin(...)`. A kind is valid only on its key.
 * A Calendar value (`Calendar.month`) is the other value `field(x).bin(...)`
 * takes, for a time column; it is its own namespace.
 *
 * `lib.ts` binds this module as `Bin` (`Bin.hex({ radius: 0.5 })`), and
 * `gofish-graphics/bin` exports the same module. A strategy's own keys are
 * its wire form, `{ kind, ...params }`, so it crosses the Python bridge as
 * IR. The kinds and their params are declared once, in gofish-ir's
 * `STRATEGIES` table, which checks a strategy where `.bin` reads it
 * (`Frontend.checkPartition`, `Frontend.checkStructBin`). `Bin.step`,
 * `Bin.thresholds` and `Bin.quantiles` are objects of a class (`StepBin`,
 * `ThresholdsBin`, `QuantilesBin`, ast/cells.ts) for their `.format(fn)`,
 * which labels their cells; the cells themselves are made in `ast/cells.ts`
 * (a line) and `ast/polygonCells.ts` (the plane).
 */
import type { Frontend } from "gofish-ir";
import { QuantilesBin, StepBin, ThresholdsBin } from "../ast/cells";

export type { QuantilesBin, StepBin, ThresholdsBin } from "../ast/cells";

/** `hex()`: a grid of hexagons. See {@link hex}. */
export type HexBin = Extract<Frontend.StructBinIR, { kind: "hex" }>;

/** `voronoi()`: one cell per seed. See {@link voronoi}. */
export type VoronoiBin = Extract<Frontend.StructBinIR, { kind: "voronoi" }>;

/** The kinds that cut the line of one field: the `Bin` value of
 *  `field(x).bin(...)`. */
export type FieldBin = StepBin | ThresholdsBin | QuantilesBin;

/** The kinds that divide the plane of two fields: the value of
 *  `struct({ x, y }).bin(...)`. */
export type StructBin = HexBin | VoronoiBin;

/** Every built-in way to bin a key. */
export type Bin = FieldBin | StructBin;

/**
 * Cells of one width, aligned to multiples of it: a value is in the cell
 * that starts at the largest multiple of `size` at or below it, whatever the
 * domain. `.format(fn)` labels the cells by a function of the cell.
 *
 * @param size The width of each cell, in data units: a finite number above 0.
 */
export function step(size: number): StepBin {
  return new StepBin(size);
}

/**
 * Cells fitted to the domain of the field in the chart's data, which they
 * cover with both ends included: a value on the last edge falls in the last
 * cell, as in numpy's `histogram` and d3's `bin`. `.format(fn)` labels the
 * cells by a function of the cell.
 *
 * @param countOrEdges A count: about that many cells, with the width a
 *   numeric axis with that many ticks would use, so the edges are round
 *   numbers. Or a list of edges: the cells end and start at them, with the
 *   domain's ends as the outer edges.
 */
export function thresholds(countOrEdges: number | number[]): ThresholdsBin {
  return new ThresholdsBin(countOrEdges);
}

/**
 * Cells whose inner edges are quantiles of the field's values in the chart's
 * data (type 7, the default of numpy and d3), with the domain's ends as the
 * outer edges, as in polars' and pandas' `qcut`. Two edges at one value, as
 * many equal values can give, are an error: ask for fewer cells.
 * `.format(fn)` labels the cells by a function of the cell.
 *
 * @param countOrProbabilities A count: that many cells, each holding about
 *   the same number of values. Or a list of probabilities, each above 0 and
 *   below 1: the inner edges are the quantiles at them.
 */
export function quantiles(
  countOrProbabilities: number | number[]
): QuantilesBin {
  return new QuantilesBin(countOrProbabilities);
}

/**
 * A grid of hexagons. Each hexagon has a corner at the top (pointy-top, as in
 * d3-hexbin, ggplot2's `geom_hex` and Observable Plot), and one hexagon is
 * centered on the origin (0, 0), so the grid does not move when the data
 * does. The grid covers the domain of the two fields in the chart's data,
 * and every hexagon in it is a cell, empty ones included.
 *
 * @param radius The distance from a hexagon's center to its corners, in data
 *   units. A number when both fields share a unit (longitude and latitude),
 *   or `{ x, y }`, one per field, when they do not (as in ggplot2's
 *   `binwidth = c(x, y)`). With one radius the hexagons are regular in data,
 *   so they look regular on screen only when the two scales match.
 */
export function hex({ radius }: Omit<HexBin, "kind">): HexBin {
  return { kind: "hex", radius };
}

/**
 * One cell per seed: the points nearer to that seed than to any other (a
 * Voronoi diagram). Each row goes to its nearest seed. The cells are clipped
 * to the box that holds the data and the seeds.
 *
 * @param seeds The seed rows, with the same two fields as the key, such as
 *   weather stations for rain gauge readings. Pass the chart's own data to
 *   give each row its own cell. Seeds at the same point share one cell.
 */
export function voronoi({ seeds }: Omit<VoronoiBin, "kind">): VoronoiBin {
  return { kind: "voronoi", seeds };
}
