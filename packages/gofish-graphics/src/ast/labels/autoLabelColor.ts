// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Labels — /internals/frontend/labels
// </gofish-wiki>

import type { DisplayList } from "gofish-ir";
import {
  apcaContrast,
  blend,
  formatHex,
  paintedRgb,
  parse,
  toLch65,
  type Color,
  type Rgb,
} from "../../colorModes";

/** The page behind every mark: white. */
const PAGE: Rgb = { mode: "rgb", r: 1, g: 1, b: 1 };

/**
 * Pick a label color for a shape that painted `style` (its lowered paint, see
 * `GoFishNode.paintedStyle`).
 * - Inside the shape: contrast against the color seen there. That is the
 *   fill composited over the white page (source-over, as SVG and CSS paint
 *   it) at the style's `opacity` times its `fillOpacity` times the fill's
 *   own alpha (an `rgba()` or `#rrggbbaa` fill). Overlapping marks under a
 *   translucent one are not composited; the page is the only background.
 *   The label is white or a near-black tint of the fill's own hue (a
 *   near-black neutral when the fill is a gray with no hue), whichever has
 *   the larger APCA contrast |Lc| against the seen color. A tie goes to the
 *   dark tint.
 * - Outside the shape: darken its ink (the fill, or the stroke when there is
 *   no fill, as on a line) to a fixed lightness, keeping its hue and chroma,
 *   for a readable tint on the white page. The tint reads the ink itself,
 *   not its composite: the label is opaque text, and the ink's hue and
 *   chroma name the shape's series at any alpha.
 *
 * The color math runs on the color actually painted: clipped to the sRGB
 * gamut and rounded to 8 bits per channel. A missing color, or one that is
 * not a parseable color (`none`, `currentColor`, `url(#…)`), gets a plain
 * fallback: `"black"` inside, `"#333333"` outside.
 */
export function autoLabelColorForFill(
  style: DisplayList.Style | undefined,
  isInside: boolean
): string {
  const fill = style?.fill ? parse(style.fill) : undefined;

  if (isInside) {
    if (fill === undefined) return "black";
    const alpha =
      (style?.opacity ?? 1) * (style?.fillOpacity ?? 1) * (fill.alpha ?? 1);
    const seen = paintedRgb(
      blend([PAGE, { ...paintedRgb(fill), alpha: Math.min(1, alpha) }])
    );
    const { h } = toLch65(paintedRgb(fill));
    const dark: Color = { mode: "lch65", l: 8, c: h === undefined ? 0 : 18, h };
    const darkLc = apcaContrast(paintedRgb(dark), seen);
    const whiteLc = apcaContrast(PAGE, seen);
    return Math.abs(whiteLc) > Math.abs(darkLc) ? "white" : formatHex(dark);
  }

  const ink = fill ?? (style?.stroke ? parse(style.stroke) : undefined);
  if (ink === undefined) return "#333333";
  const { c, h } = toLch65(paintedRgb(ink));
  return formatHex({ mode: "lch65", l: 30, c, h });
}
