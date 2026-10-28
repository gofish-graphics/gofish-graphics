// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Color Scale Resolution — /internals/layout/color-scales
// </gofish-wiki>

// Color parsing and conversion, backed by culori's tree-shakable `culori/fn`
// entry. Only the modes registered here exist: the ones whose CSS syntax we
// parse (hex / named / rgb(), hsl(), oklch()) and the ones we convert into
// (CIE Lab and LCh with the D65 white point). All conversions follow CSS
// Color 4. APCA contrast is vendored from colorjs.io (see `apcaContrast`).

import {
  blend,
  converter,
  formatHex,
  modeHsl,
  modeLab65,
  modeLch65,
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

export { blend, formatHex, parse };
export type { Color, Rgb };

export const toRgb = converter("rgb");
export const toLab65 = converter("lab65");
export const toLch65 = converter("lch65");

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

// APCA, adapted from colorjs.io 0.7.1 `src/contrast/APCA.js` (MIT, Copyright
// (c) 2021 Lea Verou, Chris Lilley), which implements APCA-W3 0.0.98G
// (https://github.com/Myndex/apca-w3). Only its sRGB input path is kept, and
// it takes culori `Rgb` directly instead of a colorjs.io color.

/** APCA's "screen luminance": a simple 2.4 gamma, not the sRGB curve. */
const apcaY = ({ r, g, b }: Rgb): number => {
  const lin = (v: number) => Math.sign(v) * Math.abs(v) ** 2.4;
  const y = lin(r) * 0.2126729 + lin(g) * 0.7151522 + lin(b) * 0.072175;
  // Soft-clamp near-black values, to account for screen flare.
  return y >= 0.022 ? y : y + (0.022 - y) ** 1.414;
};

/**
 * The APCA lightness contrast Lc of `text` on `background` (APCA-W3 0.0.98G,
 * the WCAG 3 candidate), roughly -108 to 106. Positive Lc is dark text on a
 * light background, negative is light text on a dark one; |Lc| measures
 * readability.
 */
export function apcaContrast(text: Rgb, background: Rgb): number {
  const yText = apcaY(text);
  const yBg = apcaY(background);
  // A noise gate: luminances this close have no contrast.
  if (Math.abs(yBg - yText) < 0.0005) return 0;
  const c =
    yBg > yText
      ? (yBg ** 0.56 - yText ** 0.57) * 1.14 // dark text on light
      : (yBg ** 0.65 - yText ** 0.62) * 1.14; // light text on dark
  if (Math.abs(c) < 0.1) return 0;
  return (c > 0 ? c - 0.027 : c + 0.027) * 100;
}
