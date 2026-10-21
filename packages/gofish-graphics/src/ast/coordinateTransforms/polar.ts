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
   * 0 for `polar()` (3 o'clock) and π/2 for `clock()` (12 o'clock).
   */
  baselineAngle?: number;
  /**
   * +1 counter-clockwise, -1 clockwise. Default +1 for `polar()` and -1 for
   * `clock()`.
   */
  direction?: 1 | -1;
  /** Screen-space center offset. Default [0,0]. */
  center?: [number, number];
};

/**
 * The polar family: one transform, (θ, r) → plane, whose presets differ only
 * in the angular convention they default to (`baselineAngle`, `direction`).
 * θ is axis 0 (`x`, or the declared name `theta`), r is axis 1 (`y`, or `r`).
 * See `dims` in dims.ts. The plane is y-up, so a positive `direction` turns
 * counter-clockwise on screen. The options expose GoTree's `StartAngle` /
 * `CentralAngle` / `Direction` / `InnerRadius` / `PolarCenter`.
 */
export const polarPreset =
  (type: string, defaults: { baselineAngle: number; direction: 1 | -1 }) =>
  (opts: PolarOptions = {}): CoordinateTransform => {
    const {
      innerRadius = 0,
      centralAngle = 2 * Math.PI,
      baselineAngle = defaults.baselineAngle,
      direction = defaults.direction,
      center = [0, 0],
    } = opts;
    return {
      type,
      polar: true,
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
    };
  };

/**
 * Polar coordinates in the math convention: θ=0 at 3 o'clock (+x), increasing
 * counter-clockwise. For θ=0 at 12 o'clock increasing clockwise, use
 * `clock()`.
 */
export const polar = polarPreset("polar", { baselineAngle: 0, direction: 1 });
