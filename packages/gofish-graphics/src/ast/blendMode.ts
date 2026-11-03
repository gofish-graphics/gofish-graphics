/**
 * How a paint mixes with what is under it where they overlap: the CSS
 * `mix-blend-mode` values GoFish takes. `"normal"` draws the later paint
 * over the earlier one. One type for every construct with a `blendMode`
 * option: `line` and `ribbon`, where their bands overlap, and `union`,
 * `intersect` and `atop`, where their operands overlap
 * (`graphicalOperators/porterDuff.tsx`). gofish-ir's `BLEND_MODE` is its
 * wire form.
 */
export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "color"
  | "luminosity";
