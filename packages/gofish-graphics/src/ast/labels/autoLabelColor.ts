// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Labels — /internals/frontend/labels
// </gofish-wiki>

import { formatHex, paintedRgb, parse, toLch65, toLuv } from "../../colorModes";

/**
 * Pick a label color for a shape painted with `fill` (a CSS color string).
 * - Inside the shape: contrast against the fill. A dark fill (CIELUV lightness
 *   below 60) gets white text; a light fill gets a near-black tint of its own
 *   hue, or a near-black neutral when the fill is a gray with no hue.
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
    if (toLuv(painted).l < 60) return "white";
    return formatHex({ mode: "lch65", l: 8, c: h === undefined ? 0 : 18, h });
  }
  return formatHex({ mode: "lch65", l: 30, c, h });
}
