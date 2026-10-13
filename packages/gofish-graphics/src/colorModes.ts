// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Color Scale Resolution — /internals/layout/color-scales
// </gofish-wiki>

// Color parsing and conversion, backed by culori's tree-shakable `culori/fn`
// entry. Only the modes registered here exist: the ones whose CSS syntax we
// parse (hex / named / rgb(), hsl(), oklch()) and the ones we convert into
// (CIE Lab and LCh with the D65 white point, CIELUV). All conversions follow
// CSS Color 4.

import {
  converter,
  formatHex,
  modeHsl,
  modeLab65,
  modeLch65,
  modeLuv,
  modeOklch,
  modeRgb,
  parse,
  useMode,
} from "culori/fn";
import type { Color, Rgb } from "culori/fn";

useMode(modeRgb);
useMode(modeHsl);
useMode(modeOklch);
useMode(modeLab65);
useMode(modeLch65);
useMode(modeLuv);

export { formatHex, parse };
export type { Color, Rgb };

export const toRgb = converter("rgb");
export const toLab65 = converter("lab65");
export const toLch65 = converter("lch65");
export const toLuv = converter("luv");

/** An sRGB channel in [0, 1] clipped to the gamut and rounded to 8 bits. */
export const to8Bit = (v: number): number =>
  Math.round(Math.max(0, Math.min(1, v || 0)) * 255);

/**
 * The sRGB color a renderer actually paints for `color`: clipped to the sRGB
 * gamut and rounded to 8 bits per channel. Alpha is dropped.
 */
export function paintedRgb(color: Color): Rgb {
  const { r, g, b } = toRgb(color);
  return {
    mode: "rgb",
    r: to8Bit(r) / 255,
    g: to8Bit(g) / 255,
    b: to8Bit(b) / 255,
  };
}

/**
 * `a` and `b` mixed by `u` (0 is `a`, 1 is `b`) in CIE Lab, as a hex string:
 * the color a mark passes through while a tween moves it from one keyframe's
 * paint to the next one's. A paint that is not a color (`"none"`, a pattern
 * url) cannot be mixed, so it switches at the halfway point instead.
 */
export function mixColor(a: string, b: string, u: number): string {
  if (a === b || u <= 0) return a;
  if (u >= 1) return b;
  const ca = parse(a);
  const cb = parse(b);
  if (ca === undefined || cb === undefined) return u < 0.5 ? a : b;
  const la = toLab65(ca);
  const lb = toLab65(cb);
  return formatHex(
    toRgb({
      mode: "lab65",
      l: la.l + (lb.l - la.l) * u,
      a: la.a + (lb.a - la.a) * u,
      b: la.b + (lb.b - la.b) * u,
    })
  );
}
