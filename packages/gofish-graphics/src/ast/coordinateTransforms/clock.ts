import { polarPreset } from "./polar";

/**
 * Clock coordinates: the polar transform in the clock convention, θ=0 at
 * 12 o'clock (+y, up), increasing clockwise. It differs from `polar()` only in
 * its `baselineAngle` (π/2) and `direction` (-1) defaults, and accepts the same
 * options (e.g. `innerRadius` for a clock rim). The distinct `type` tag keeps
 * the preset through serialization.
 */
export const clock = polarPreset("clock");
