// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * The `Bin` family: the cells a key built from two fields is binned into,
 * the value of `struct({ x, y }).bin(...)` (#1059, #48).
 *
 * `lib.ts` binds this module as `Bin` (`Bin.hex({ radius: 0.5 })`), and
 * `gofish-graphics/bin` exports the same module. A strategy is a plain object
 * made by a function call, `{ kind, ...params }`, and that object is also its
 * wire form, so it crosses the Python bridge as IR. The kinds and their
 * params are declared once, in gofish-ir's `STRATEGIES` table, which checks a
 * strategy where `struct(...).bin` reads it. The cells themselves are made in
 * `ast/polygonCells.ts`.
 *
 * A 1D partition of one field (`{ step }`, `{ thresholds }`, a Calendar
 * value) is not in this family: it is the argument of `field(x).bin(p)`.
 */
import type { Frontend } from "gofish-ir";

/** Every built-in way to bin two fields together: the value of
 *  `struct({ x, y }).bin(...)`. */
export type Bin = Frontend.BinIR;

/** `hex()`: a grid of hexagons. See {@link hex}. */
export type HexBin = Extract<Bin, { kind: "hex" }>;

/** `voronoi()`: one cell per seed. See {@link voronoi}. */
export type VoronoiBin = Extract<Bin, { kind: "voronoi" }>;

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
