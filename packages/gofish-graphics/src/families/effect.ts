/**
 * The `Effect` family: the strategies of the `effect` option every mark and
 * `layer` take (#1267). The option filters the node's whole drawing as one
 * picture, and also takes a raw CSS filter string (`"blur(2px)"`).
 *
 * `lib.ts` binds this module as `Effect` (`Effect.grayscale()`), and
 * `gofish-graphics/effect` exports the same module. No strategy has a
 * required option, so each is a value as it is, and calling it sets options:
 * `Effect.grayscale` is `Effect.grayscale()` (#1133, `ast/strategyKind.ts`).
 * A strategy is a plain object, `{ kind, ...params }`, and that object is
 * also its wire form. The kinds and their params are declared once, in
 * gofish-ir's `STRATEGIES` table. The effect is drawn in `_node.ts`
 * (`INTERNAL_lower`), as a display-list group with a `filter`.
 */
import type { Frontend } from "gofish-ir";
import { bareKind, given } from "../ast/strategyKind";

/** Every built-in effect strategy. */
export type Effect = Frontend.EffectIR;

/** `grayscale()`: the drawing in grays. See {@link grayscale}. */
export type GrayscaleEffect = Extract<Effect, { kind: "grayscale" }>;

/** `luminanceToAlpha()`: the drawing as a luminance mask. See
 *  {@link luminanceToAlpha}. */
export type LuminanceToAlphaEffect = Extract<
  Effect,
  { kind: "luminanceToAlpha" }
>;

/**
 * Draw in grays: CSS `grayscale(amount)`.
 *
 * @param amount How far to gray, from 0 (unchanged) to 1 (all gray).
 *   Default 1.
 */
export const grayscale = bareKind(
  "Effect.grayscale",
  (opts: Omit<GrayscaleEffect, "kind"> = {}): GrayscaleEffect => ({
    kind: "grayscale",
    ...given(opts),
  })
);

/**
 * Make each pixel black, with an alpha of its luminance: white is opaque and
 * black is clear. A compositing operator (`intersect`, `subtract`, ...) that
 * reads the drawing as a shape then reads its luminance, as a luminance mask
 * does. Drawn as SVG `feColorMatrix type="luminanceToAlpha"`, in sRGB.
 */
export const luminanceToAlpha = bareKind(
  "Effect.luminanceToAlpha",
  (): LuminanceToAlphaEffect => ({ kind: "luminanceToAlpha" })
);
