// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Labels — /internals/frontend/labels
// </gofish-wiki>

import {
  apcaContrast,
  formatHex,
  paintedRgb,
  parse,
  toLch65,
  type Color,
  type Rgb,
} from "../../colorModes";

const WHITE: Rgb = { mode: "rgb", r: 1, g: 1, b: 1 };

/**
 * Pick a label color for a shape painted with `fill` (a CSS color string).
 * - Inside the shape: contrast against the fill. The label is white or a
 *   near-black tint of the fill's own hue (a near-black neutral when the fill
 *   is a gray with no hue), whichever has the larger APCA contrast |Lc|
 *   against the fill. A tie goes to the dark tint.
 * - Outside the shape: darken the fill to a fixed lightness, keeping its hue
 *   and chroma, for a readable tint on a white background.
 *
 * The color math runs on the color actually painted: the fill clipped to the
 * sRGB gamut and rounded to 8 bits per channel. A missing fill, or one that is
 * not a parseable color (`none`, `currentColor`, `url(#…)`), gets the same
 * plain fallback as no fill: `"black"` inside, `"#333333"` outside.
 */
export function autoLabelColorForFill(
  fill: string | null,
  isInside: boolean
): string {
  const parsed = fill ? parse(fill) : undefined;
  if (parsed === undefined) return isInside ? "black" : "#333333";

  const painted = paintedRgb(parsed);
  const { c, h } = toLch65(painted);

  if (isInside) {
    const dark: Color = {
      mode: "lch65",
      l: 8,
      c: h === undefined ? 0 : 18,
      h,
    };
    const darkLc = apcaContrast(paintedRgb(dark), painted);
    const whiteLc = apcaContrast(WHITE, painted);
    return Math.abs(whiteLc) > Math.abs(darkLc) ? "white" : formatHex(dark);
  }
  return formatHex({ mode: "lch65", l: 30, c, h });
}
