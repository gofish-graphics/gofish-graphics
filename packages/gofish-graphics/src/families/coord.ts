/**
 * The `Coord` family: the coordinate transforms of a chart's or a layer's
 * `coord` option.
 *
 * `lib.ts` binds this module as `Coord` (`Coord.polar()`), and
 * `gofish-graphics/coord` exports the same module. Each transform is defined
 * in its own file under `ast/coordinateTransforms/`; this module is their one
 * public home. A layer with a `coord`, `layer({ coord }, children)`, is the
 * coordinate space of its children.
 */
import type { CoordinateTransform } from "../ast/coordinateTransforms/coord";

/** A coordinate transform: what a `coord` option takes. */
export type Coord = CoordinateTransform;

export { polar } from "../ast/coordinateTransforms/polar";
export type { PolarOptions } from "../ast/coordinateTransforms/polar";
export { clock } from "../ast/coordinateTransforms/clock";
export { wavy } from "../ast/coordinateTransforms/wavy";
export { geo } from "../ast/coordinateTransforms/geo";
export type { Projection, GeoOptions } from "../ast/coordinateTransforms/geo";
