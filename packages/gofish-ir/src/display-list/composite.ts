// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Rendering — /internals/core/rendering
// </gofish-wiki>

import type { CompositeItem, DisplayItem } from "./schema.js";

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
 *   union:      a only → a, b only → b, both → b blended over a
 *   intersect:  both → b blended over a
 *   subtract:   a only → a
 *   exclude:    a only → a, b only → b
 *   atop:       a only → a, both → b blended over a
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
    case "union":
      return filled
        ? [layer("fill", [alpha(...all(n))])]
        : all(n).map((i) => layer(i, [], i > 0));
    case "intersect":
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
    case "subtract": {
      const rest = all(n, 1);
      const masks = rest.length ? [outside(...rest)] : [];
      return [filled ? layer("fill", [alpha(0), ...masks]) : layer(0, masks)];
    }
    case "exclude":
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

/** A key that names a mask, so a plan writes each distinct mask once. */
const maskKey = (m: CompositeMask): string =>
  `${m.invert ? "outside" : "alpha"}-${m.operands.join("-")}`;

/**
 * A composite as SVG draws it, ids and all: the one plan both SVG backends
 * (`render.ts` here and `paintSVG.tsx` in gofish-graphics) only write out,
 * so they cannot drift.
 *
 * Each group of items in `defs` is written once, as a `<g id>` def. Each
 * mask in `masks` is a `<mask>`: with `alpha`, an alpha mask
 * (`mask-type:alpha`) of `<use>`s of those defs' shapes; with `outside`, a
 * white rect over the item's bbox with a black rect over it, clipped by the
 * alpha mask `outside` names, so it is one minus that mask. Every mask's
 * region is the item's bbox, in user space (`maskUnits="userSpaceOnUse"`
 * with its `x`, `y`, `width` and `height`): left out, a mask's region is
 * SVG's default, -10% to 110% of the viewport, and a composite past it
 * would not be masked. Each layer is a
 * `<use>` of a def, wrapped in a `<g mask>` per mask (the first mask
 * outermost), and, with a `blendMode`, in a group that mixes by it. The
 * layers sit in a group `isolate`d, so a blend mixes the layers only.
 */
export interface CompositePlan {
  defs: { id: string; items: DisplayItem[] }[];
  masks: ({ id: string; alpha: string[] } | { id: string; outside: string })[];
  layers: { use: string; masks: string[]; blendMode?: string }[];
}

/**
 * The plan for drawing `item` ({@link CompositePlan}), its ids prefixed by
 * `uid`. The layers are {@link compositeLayers}', less any that draws an
 * operand with no paint (a hidden one): it would draw nothing. A def is
 * written only when a layer or a mask uses it: an operand's paint where a
 * layer draws it or a mask reads it as the operand's shape, and its shape,
 * when it differs from its paint, only where a mask reads it.
 */
export function compositePlan(item: CompositeItem, uid: string): CompositePlan {
  const { operands } = item;
  const paintId = (i: number) => `${uid}-p${i}`;
  const shapeId = (i: number) =>
    operands[i].shape ? `${uid}-s${i}` : paintId(i);
  const fillId = `${uid}-fill`;
  const used = new Set<string>();
  const masks = new Map<string, CompositePlan["masks"][number]>();
  const maskId = (m: CompositeMask): string => {
    const id = `${uid}-m-${maskKey(m)}`;
    if (!masks.has(id)) {
      if (m.invert) {
        masks.set(id, {
          id,
          outside: maskId({ operands: m.operands, invert: false }),
        });
      } else {
        const uses = m.operands.map(shapeId);
        for (const u of uses) used.add(u);
        masks.set(id, { id, alpha: uses });
      }
    }
    return id;
  };
  const layers = compositeLayers(
    item.operator,
    operands.length,
    item.fill !== undefined
  )
    .filter((l) => l.draw === "fill" || operands[l.draw].paint.length > 0)
    .map((l) => {
      const use = l.draw === "fill" ? fillId : paintId(l.draw);
      used.add(use);
      return {
        use,
        masks: l.masks.map(maskId),
        ...(l.blend && item.blendMode !== undefined
          ? { blendMode: item.blendMode }
          : {}),
      };
    });
  const defs: CompositePlan["defs"] = [];
  const def = (id: string, items: DisplayItem[] | undefined) => {
    if (items && used.has(id)) defs.push({ id, items });
  };
  operands.forEach((o, i) => {
    def(paintId(i), o.paint);
    def(`${uid}-s${i}`, o.shape);
  });
  def(fillId, item.fill);
  return { defs, masks: [...masks.values()], layers };
}
