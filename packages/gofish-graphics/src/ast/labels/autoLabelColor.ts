// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Labels — /internals/frontend/labels
// </gofish-wiki>

import {
  apcaContrast,
  compositeOver,
  formatHex,
  paintedRgb,
  parse,
  toLch65,
  type Color,
  type Rgb,
} from "../../colorModes";

/** The page behind every mark: white. The outside tint is made for it, and
 *  a translucent fill is seen over it. */
const PAGE: Rgb = { mode: "rgb", r: 1, g: 1, b: 1 };

/**
 * Pick a label color for a shape painted with `fill` (a CSS color string) at
 * `alpha` (the shape's opacity times its fill opacity; 1 when opaque).
 * - Inside the shape: contrast against the color seen there, which is the
 *   fill composited over the white page at `alpha` times the fill's own
 *   alpha (see `compositeOver`). The label is white or a near-black tint of
 *   the fill's own hue (a near-black neutral when the fill is a gray with no
 *   hue), whichever has the larger APCA contrast |Lc| against the seen
 *   color. A tie goes to the dark tint.
 * - Outside the shape: darken the fill to a fixed lightness, keeping its hue
 *   and chroma, for a readable tint on a white background. The tint is read
 *   from the fill itself, not from its composite: the label is opaque text,
 *   and the fill's hue and chroma name its series at any alpha.
 *
 * The color math runs on the color actually painted: the fill clipped to the
 * sRGB gamut and rounded to 8 bits per channel. A missing fill, or one that is
 * not a parseable color (`none`, `currentColor`, `url(#…)`), gets the same
 * plain fallback as no fill: `"black"` inside, `"#333333"` outside.
 */
export function autoLabelColorForFill(
  fill: string | null,
  alpha: number,
  isInside: boolean
): string {
  const parsed = fill ? parse(fill) : undefined;
  if (parsed === undefined) return isInside ? "black" : "#333333";

  const { c, h } = toLch65(paintedRgb(parsed));

  if (isInside) {
    const seen = compositeOver(parsed, alpha, PAGE);
    const dark: Color = {
      mode: "lch65",
      l: 8,
      c: h === undefined ? 0 : 18,
      h,
    };
    const darkLc = apcaContrast(paintedRgb(dark), seen);
    const whiteLc = apcaContrast(PAGE, seen);
    return Math.abs(whiteLc) > Math.abs(darkLc) ? "white" : formatHex(dark);
  }
  return formatHex({ mode: "lch65", l: 30, c, h });
}
