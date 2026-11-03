// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Rendering — /internals/core/rendering
// </gofish-wiki>

import type { CompositeItem } from "./schema.js";

/** A mask a composite layer is clipped by: the alpha of the listed
 *  operands' shapes drawn together (their union), or, with `invert`, one
 *  minus it (everywhere they are not). */
export interface CompositeMask {
  operands: number[];
  invert: boolean;
}

/** One layer of a drawn composite: an operand's paint (by index), or the
 *  result's fill, clipped by each mask in turn. With `blend`, it mixes with
 *  the layers below it by the item's `blendMode`. */
export interface CompositeLayer {
  draw: number | "fill";
  masks: CompositeMask[];
  blend: boolean;
}

const all = (n: number, from = 0): number[] =>
  Array.from({ length: Math.max(0, n - from) }, (_, i) => i + from);

const alpha = (...operands: number[]): CompositeMask => ({
  operands,
  invert: false,
});
const outside = (...operands: number[]): CompositeMask => ({
  operands,
  invert: true,
});

/**
 * The layers a composite draws, in order: the one table both SVG backends
 * (`render.ts` here and `paintSVG.tsx` in gofish-graphics) read, so they
 * cannot drift. `n` is the number of operands, and `filled` whether the
 * item has a `fill`.
 *
 * With a fill, the fill is drawn once over the result's region. With none,
 * each operand's paint is drawn where the operator keeps it (PiCCL's
 * coverage-blend rule, for operands a and b):
 *
 *   over (union):      a only → a, b only → b, both → b blended over a
 *   in (intersect):    both → b blended over a
 *   out (subtract):    a only → a
 *   xor (exclude):     a only → a, b only → b
 *   atop:              a only → a, both → b blended over a
 *
 * A hidden operand has shape and no paint, so it only clips.
 */
export function compositeLayers(
  operator: CompositeItem["operator"],
  n: number,
  filled: boolean
): CompositeLayer[] {
  const layer = (
    draw: number | "fill",
    masks: CompositeMask[],
    blend = false
  ): CompositeLayer => ({ draw, masks, blend });
  switch (operator) {
    case "over":
      return filled
        ? [layer("fill", [alpha(...all(n))])]
        : all(n).map((i) => layer(i, [], i > 0));
    case "in":
      return filled
        ? [
            layer(
              "fill",
              all(n).map((i) => alpha(i))
            ),
          ]
        : all(n).map((i) =>
            layer(
              i,
              all(n)
                .filter((j) => j !== i)
                .map((j) => alpha(j)),
              i > 0
            )
          );
    case "out": {
      const rest = all(n, 1);
      const masks = rest.length ? [outside(...rest)] : [];
      return [filled ? layer("fill", [alpha(0), ...masks]) : layer(0, masks)];
    }
    case "xor":
      return filled
        ? [
            layer("fill", [alpha(0), outside(1)]),
            layer("fill", [alpha(1), outside(0)]),
          ]
        : [layer(0, [outside(1)]), layer(1, [outside(0)])];
    case "atop":
      return [
        layer(filled ? "fill" : 0, filled ? [alpha(0)] : []),
        ...all(n, 1).map((i) => layer(i, [alpha(0)], true)),
      ];
  }
}

/** A key that names a mask, so a backend writes each distinct mask once. */
export const compositeMaskKey = (m: CompositeMask): string =>
  `${m.invert ? "out" : "in"}-${m.operands.join("-")}`;
