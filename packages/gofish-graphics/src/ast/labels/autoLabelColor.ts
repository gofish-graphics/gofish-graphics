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
import { inks } from "../geometry/outline";

/** The page behind every mark: white. */
const PAGE: Rgb = { mode: "rgb", r: 1, g: 1, b: 1 };

/** The paint a label draws behind its own glyphs, from bottom to top: its
 *  background box's fill and its halo's color, each when it draws one. */
export type LabelBackdrop = { background?: string; halo?: string };

/**
 * A CSS color as the paint it puts down, at `alpha` times its own alpha:
 * undefined when it puts down none (`none`, `transparent`, alpha 0) or is
 * not a parseable color (`currentColor`, `url(#…)`).
 */
function visiblePaint(css: string | undefined, alpha = 1): Color | undefined {
  if (!css || !inks(css)) return undefined;
  const parsed = parse(css);
  if (parsed === undefined) return undefined;
  const a = Math.min(1, alpha * (parsed.alpha ?? 1));
  return a > 0 ? { ...paintedRgb(parsed), alpha: a } : undefined;
}

/**
 * Pick a label color for a shape that painted `style` (its lowered paint, see
 * `GoFishNode.paintedStyle`), for a label that sits inside the shape or
 * outside it, and draws `backdrop` behind its own glyphs.
 *
 * The label is read against the color directly behind its glyphs: the white
 * page, under the shape's fill when the label sits inside the shape, under
 * the label's background box, under its halo, each composited over the ones
 * below it (source-over, as SVG and CSS paint it). The shape's fill counts at
 * the style's `opacity` times its `fillOpacity` times the fill's own alpha
 * (an `rgba()` or `#rrggbbaa` fill). Overlapping marks under a translucent
 * one are not composited, and the page is assumed white.
 *
 * The label is white or a dark color, whichever has the larger APCA contrast
 * |Lc| against that backdrop. A tie goes to the dark color. The dark color
 * depends on where the label sits:
 * - Inside the shape: a near-black tint of the fill's own hue (a near-black
 *   neutral when the fill is a gray with no hue).
 * - Outside the shape: its ink (the fill, or the stroke when the fill puts
 *   down no paint, as on a line) darkened to a fixed lightness, keeping its
 *   hue and chroma, so the label names the shape's series. The tint reads the
 *   ink itself, not its composite: the ink's hue and chroma name the series
 *   at any alpha.
 *
 * The color math runs on the color actually painted: clipped to the sRGB
 * gamut and rounded to 8 bits per channel. A fill or stroke that puts down
 * no paint (`none`, `transparent`, alpha 0), or is not a parseable color
 * (`currentColor`, `url(#…)`), is not there: the shape adds nothing to the
 * backdrop, and with no ink the dark color is a plain `"black"` inside and
 * `"#333333"` outside.
 */
export function autoLabelColorForStyle(
  style: DisplayList.Style | undefined,
  isInside: boolean,
  backdrop: LabelBackdrop = {}
): string {
  const opacity = style?.opacity ?? 1;
  const fill = visiblePaint(style?.fill, opacity * (style?.fillOpacity ?? 1));

  const layers = [
    isInside ? fill : undefined,
    visiblePaint(backdrop.background),
    visiblePaint(backdrop.halo),
  ].filter((c): c is Color => c !== undefined);
  const seen = paintedRgb(blend([PAGE, ...layers]));

  let dark: string;
  if (isInside) {
    const h = fill === undefined ? undefined : toLch65(fill).h;
    dark =
      fill === undefined
        ? "black"
        : formatHex({ mode: "lch65", l: 8, c: h === undefined ? 0 : 18, h });
  } else {
    const ink = fill ?? visiblePaint(style?.stroke, opacity);
    if (ink === undefined) dark = "#333333";
    else {
      const { c, h } = toLch65(ink);
      dark = formatHex({ mode: "lch65", l: 30, c, h });
    }
  }
  const darkLc = apcaContrast(paintedRgb(parse(dark)!), seen);
  const whiteLc = apcaContrast(PAGE, seen);
  return Math.abs(whiteLc) > Math.abs(darkLc) ? "white" : dark;
}
