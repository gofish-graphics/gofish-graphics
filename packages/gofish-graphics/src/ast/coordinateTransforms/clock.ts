import { Frontend } from "gofish-ir";
import { given } from "../strategyKind";
import { polar, type PolarOptions } from "./polar";
import type { CoordinateTransform } from "./coord";

/** The options of `clock()`: polar's, less the ones the preset fixes
 *  (gofish-ir's `COORD_PRESETS.clock`). */
export type ClockOptions = Omit<
  PolarOptions,
  Frontend.PresetFixed<"Coord", "clock">
>;

/**
 * Clock coordinates: a preset of `polar()`, θ=0 at 12 o'clock (+y, up),
 * increasing clockwise. It is `polar({ baselineAngle: π/2, direction: -1 })`,
 * as `COORD_PRESETS` declares, and takes polar's other options (e.g.
 * `innerRadius` for a clock rim). Passing `baselineAngle` or `direction` is
 * an error that names the `polar(...)` call to write instead. It is a polar
 * space, and crosses the wire as one.
 */
export const clock = (opts: ClockOptions = {}): CoordinateTransform =>
  polar(Frontend.presetOptions("Coord", "clock", given(opts)) as PolarOptions);
