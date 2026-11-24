import { Frontend } from "gofish-ir";
import { CoordinateTransform } from "./coord";

export type PolarOptions = {
  /** Donut hole as a fraction [0,1) of the outer radius. Default 0 (filled disc). */
  innerRadius?: number;
  /** Total angular sweep in radians. Default 2π (full circle). */
  centralAngle?: number;
  /**
   * The angle where the angular axis's 0 sits: radians, measured
   * counter-clockwise from 3 o'clock. Data 0 on θ always maps here, whatever
   * the θ range and `centralAngle` (a centered stack centers on it). Default
   * 0 (3 o'clock).
   */
  baselineAngle?: number;
  /** +1 counter-clockwise, -1 clockwise. Default +1. */
  direction?: 1 | -1;
  /** Screen-space center offset. Default [0,0]. */
  center?: [number, number];
};

/** The defaults its descriptor declares (gofish-ir's `COORDS.polar`), which
 *  Python's `Coord.polar()` and the API reference are generated from, so the
 *  two languages default alike. */
const DEFAULTS = Object.fromEntries(
  Object.entries(Frontend.resolveFields(Frontend.COORDS.polar)).map(
    ([key, field]) => [key, field.default]
  )
) as Required<PolarOptions>;

/**
 * Polar coordinates: one transform, (θ, r) → plane. By default it is in the
 * math convention, θ=0 at 3 o'clock (+x), increasing counter-clockwise;
 * `baselineAngle` and `direction` set another convention, and `clock()` is
 * its preset for 12 o'clock, clockwise. θ is axis 0 (`x`, or the declared
 * name `theta`), r is axis 1 (`y`, or `r`). See `dims` in dims.ts. The plane
 * is y-up, so a positive `direction` turns counter-clockwise on screen. The
 * options expose GoTree's `StartAngle` / `CentralAngle` / `Direction` /
 * `InnerRadius` / `PolarCenter`.
 */
export const polar = (opts: PolarOptions = {}): CoordinateTransform => {
  const {
    innerRadius = DEFAULTS.innerRadius,
    centralAngle = DEFAULTS.centralAngle,
    baselineAngle = DEFAULTS.baselineAngle,
    direction = DEFAULTS.direction,
    center = DEFAULTS.center,
  } = opts;
  // The options given, as the wire carries them (an undefined one is not
  // given).
  const given = Object.fromEntries(
    Object.entries(opts).filter(([, v]) => v !== undefined)
  );
  return {
    type: "polar",
    polar: true,
    axisTraits: [{ HasCycle: { period: 2 * Math.PI } }, { HasZero: {} }],
    transform: ([theta, r]: [number, number]) => [
      center[0] + r * Math.cos(baselineAngle + direction * theta),
      center[1] + r * Math.sin(baselineAngle + direction * theta),
    ],
    aliases: { x: "theta", y: "r" },
    innerRadius,
    // domain[0] is the angular budget (CentralAngle); coord.layout reads its
    // `size` as the θ space children are allotted, replacing the old 2π literal.
    // domain[1].max (radius) is still a placeholder used only by the debug grid;
    // axis ticks read the resolved underlying space, not this.
    domain: [
      { min: 0, max: centralAngle, size: centralAngle },
      { min: 0, max: 100, size: 100 },
    ],
    toJSON: () => ({ type: "polar", ...given }),
  };
};
