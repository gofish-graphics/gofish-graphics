import { CoordinateTransform } from "./coord";

export type PolarOptions = {
  /** Donut hole as a fraction [0,1) of the outer radius. Default 0 (filled disc). */
  innerRadius?: number;
  /** Total angular sweep in radians. Default 2π (full circle). */
  centralAngle?: number;
  /** Angle (radians) of θ=0. Default π/2 — 12 o'clock. */
  startAngle?: number;
  /** +1 counter-clockwise, -1 clockwise. Default -1 (clockwise, the pie default). */
  direction?: 1 | -1;
  /** Screen-space center offset. Default [0,0]. */
  center?: [number, number];
};

/**
 * Polar coordinate transform: maps (θ, r) → screen. θ is the x-axis (alias
 * `theta`/`thetaSize`), r is the y-axis (alias `r`/`rSize`).
 *
 * Defaults reproduce the historical `polar()` exactly: θ=0 at 12 o'clock,
 * increasing clockwise, filled disc, full 2π sweep, centered at the origin
 * (`cos(-θ+π/2)` ≡ `cos(π/2 + (-1)·θ)`). The options expose GoTree's
 * `StartAngle` / `CentralAngle` / `Direction` / `InnerRadius` / `PolarCenter`.
 */
export const polar = (opts: PolarOptions = {}): CoordinateTransform => {
  const {
    innerRadius = 0,
    centralAngle = 2 * Math.PI,
    startAngle = Math.PI / 2,
    direction = -1,
    center = [0, 0],
  } = opts;
  return {
    type: "polar",
    transform: ([theta, r]: [number, number]) => [
      center[0] + r * Math.cos(startAngle + direction * theta),
      center[1] + r * Math.sin(startAngle + direction * theta),
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
