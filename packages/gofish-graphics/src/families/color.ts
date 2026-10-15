/**
 * The `Color` family: the color scales of a chart's `color` option.
 *
 * `lib.ts` binds this module as `Color` (`Color.palette("tableau10")`), and
 * `gofish-graphics/color` exports the same module. A scale is a plain object
 * tagged by `_tag`, so it crosses the Python bridge as IR. The colors are
 * assigned in `ast/colorSchemes.ts`. (The lowercase `color` export is a
 * different thing: an object of named colors, `color.red`, ...)
 */

/** A discrete scale: a scheme name, a list of colors cycled by index, or a
 *  map from each value to its color. */
export type PaletteScale = {
  _tag: "palette";
  values: string | string[] | Record<string, string>;
};

/** A continuous scale: a scheme name or a list of color stops. */
export type GradientScale = { _tag: "gradient"; stops: string | string[] };

/** A color scale: what a chart's `color` option takes. */
export type Color = PaletteScale | GradientScale;

/** A discrete color scale. */
export const palette = (
  values: string | string[] | Record<string, string>
): PaletteScale => ({ _tag: "palette", values });

/** A continuous color scale. */
export const gradient = (stops: string | string[]): GradientScale => ({
  _tag: "gradient",
  stops,
});
