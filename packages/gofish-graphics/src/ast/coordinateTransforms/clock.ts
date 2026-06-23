import { CoordinateTransform } from "./coord";
import { polar, PolarOptions } from "./polar";

/**
 * Clock coordinate system: a `polar()` preset. 0° at 12 o'clock, increasing
 * clockwise (the standard clock direction) — which are already `polar()`'s
 * defaults, so `clock()` is `polar()` with a distinct `type` tag. The tag is
 * kept because coordUtils' bbox sampling special-cases `"clock"`/`"polar"`, and
 * so user specs read intent. Accepts the same options (e.g. `innerRadius` for a
 * clock rim).
 */
export const clock = (opts: PolarOptions = {}): CoordinateTransform => ({
  ...polar(opts),
  type: "clock",
});
