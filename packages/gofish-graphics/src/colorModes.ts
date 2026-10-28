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
 * The sRGB color seen where `color` is painted at `alpha` over `background`:
 * the painted color (see {@link paintedRgb}) blended with the background by
 * straight alpha, channel by channel, then rounded to 8 bits, the way SVG and
 * CSS composite. The alpha is `alpha` times the color's own alpha (an
 * `rgba()` or `#rrggbbaa` color carries one), clamped to [0, 1].
 */
export function compositeOver(
  color: Color,
  alpha: number,
  background: Rgb
): Rgb {
  const a = Math.max(0, Math.min(1, alpha * (color.alpha ?? 1)));
  const fg = paintedRgb(color);
  const bg = paintedRgb(background);
  const blend = (f: number, b: number) => to8Bit(a * f + (1 - a) * b) / 255;
  return {
    mode: "rgb",
    r: blend(fg.r, bg.r),
    g: blend(fg.g, bg.g),
    b: blend(fg.b, bg.b),
  };
}

/** An sRGB color's screen luminance, soft-clamped near black (APCA-W3). */
function apcaLuminance({ r, g, b }: Rgb): number {
  const y = 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.072175 * b ** 2.4;
  return y > 0.022 ? y : y + (0.022 - y) ** 1.414;
}

/**
 * The APCA lightness contrast Lc of `text` on `background` (APCA-W3 0.0.98G,
 * the WCAG 3 candidate), roughly -108 to 106. Positive Lc is dark text on a
 * light background, negative Lc is light text on a dark one; |Lc| measures
 * readability. Contrast below |Lc| 10 reads as 0.
 */
export function apcaContrast(text: Rgb, background: Rgb): number {
  const t = apcaLuminance(text);
  const bg = apcaLuminance(background);
  if (Math.abs(bg - t) < 0.0005) return 0;
  if (bg > t) {
    const s = (bg ** 0.56 - t ** 0.57) * 1.14;
    return s < 0.1 ? 0 : (s - 0.027) * 100;
  }
  const s = (bg ** 0.65 - t ** 0.62) * 1.14;
  return s > -0.1 ? 0 : (s + 0.027) * 100;
}
