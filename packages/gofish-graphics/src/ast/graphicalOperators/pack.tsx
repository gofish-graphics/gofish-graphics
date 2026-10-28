// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

import { packEnclose, packSiblings } from "d3-hierarchy";

import { GoFishNode, placedTranslate } from "../_node";
import { GoFishAST } from "../_ast";
import { createNodeOperator } from "../withGoFish";
import { Size } from "../dims";
import { UNDEFINED, UnderlyingSpace } from "../underlyingSpace";
import {
  createOperator,
  type NameableMark,
  type TranslatableOperator,
} from "../marks/createOperator";
import type { MarkChild } from "../types";
import { SplitBy, splitEntries } from "../datumProjection";
import { boxOfDims, enclosingCircle, translateOutline } from "../geometry";

type PackProps = {
  key?: string;
  /** Pixels between sibling circles. Default 0. */
  spacing?: number;
};

/**
 * pack: place children so their enclosing circles touch and do not overlap,
 * then report the smallest circle around them as this node's box.
 *
 * A foreign layout, like `treemap`: it lays out each child, reads the child's
 * geometry, runs d3, and `place()`s each child. The children keep the pixel
 * size they lay out at, and the pack's size follows from them. It packs each
 * child's enclosing circle with d3's front-chain algorithm (`packSiblings`,
 * Wang et al. 2006), each grown by `spacing / 2`, so neighbors keep `spacing`
 * pixels apart; the pack's circle is the smallest around the children
 * themselves, so the gap is only between siblings. There is one packing
 * strategy, so there is no option to choose one (#1013).
 *
 * Its outline is its children's outlines, so an `enclose` around a pack hugs
 * what it packed, not the pack's box. A group's outline in general is #974;
 * only pack answers it so far.
 */
export const Pack = createNodeOperator(
  (opts: PackProps, children: GoFishAST[]) => {
    const { key, spacing = 0 } = opts;
    if (typeof spacing !== "number" || !Number.isFinite(spacing) || spacing < 0)
      throw new Error(
        `[gofish] pack({ spacing }): ${JSON.stringify(spacing)} is not a ` +
          `number of pixels at least 0.`
      );
    const pad = spacing / 2;
    return new GoFishNode(
      {
        type: "pack",
        args: { key },
        key,
        // TODO(#967): pack does not fit itself to the available size; radii stay in pixels. See issue #967.
        // Its size is whatever its children's pixel sizes pack into, which is
        // what a literal-sized shape reports: no data-driven extent.
        resolveUnderlyingSpace: (): Size<UnderlyingSpace> => [
          UNDEFINED,
          UNDEFINED,
        ],
        layout: (size, scales, childAsts) => {
          const placed = childAsts.map((child) => child.layout(size, scales));
          const local = placed.map((p) => enclosingCircle(p.geometry()));
          for (const c of local) {
            if (!Number.isFinite(c.r) || c.r < 0)
              throw new Error(
                "[gofish] pack: a child has no pixel size. pack keeps its " +
                  "children at their pixel size and cannot yet scale " +
                  "data-driven sizes (#967)."
              );
          }

          // Circles in data order, each grown by half the spacing, so
          // neighbors keep `spacing` apart; packSiblings writes their x, y.
          const packed = packSiblings(local.map((c) => ({ r: c.r + pad })));
          // The smallest circle around the children themselves (not their
          // grown circles), so the spacing is between siblings only: a pack
          // carries no margin past its outermost children. Its radius is
          // measured here about d3's center rather than taken from d3, so
          // every child lies inside it exactly.
          const at = packed.map((c, i) => ({ x: c.x, y: c.y, r: local[i].r }));
          // (d3 encloses no circles in nothing; an empty pack is a point.)
          const { x: ex, y: ey } = packEnclose(at) ?? { x: 0, y: 0 };
          const R = at.reduce(
            (m, c) => Math.max(m, Math.hypot(c.x - ex, c.y - ey) + c.r),
            0
          );

          placed.forEach((p, i) => {
            const box = p.geometry().box;
            // Land the child's circle center at (R + x, R + y) about that
            // center: place the child's box min at that point less the
            // center's offset from it.
            p.place(0, R + at[i].x - ex - (local[i].cx - box.min[0]), "min");
            p.place(1, R + at[i].y - ey - (local[i].cy - box.min[1]), "min");
          });

          return {
            intrinsicDims: [
              { min: 0, size: 2 * R },
              { min: 0, size: 2 * R },
            ],
            transform: { translate: [undefined, undefined] },
          };
        },
        // The circle pack already found; the default (the smallest circle
        // around the placed children) gives the same one.
        geometry: ({ intrinsicDims }, _children, node) => {
          const box = boxOfDims(intrinsicDims, node.type);
          const R = (box.max[0] - box.min[0]) / 2;
          return {
            box,
            enclosingCircle: () => ({
              cx: box.min[0] + R,
              cy: box.min[1] + R,
              r: R,
            }),
            // Its children's outlines, each moved by the child's translate
            // into the pack's frame.
            outline: (tolerance: number) =>
              _children.flatMap((child) => {
                const t = placedTranslate(child, node);
                return child
                  .geometry()
                  .outline(tolerance)
                  .map((o) => translateOutline(o, t));
              }),
          };
        },
      },
      children
    );
  }
);

export type PackOptions = {
  /** Pixels between sibling circles. Default 0. */
  spacing?: number;
  /** Field to partition rows by (like `spread`/`scatter`); also accepts a
   *  `field(...)` accessor. Without `by`, one child per row. */
  by?: SplitBy;
};

const packOperator = createOperator<any, PackOptions>(
  ((props: PackProps, children: GoFishAST[]) => Pack(props, children)) as any,
  {
    split: ({ by }, d) => splitEntries(by, d),
    serialize: "pack",
  }
);

/**
 * Pack the flow's groups (or rows, without `by`) by their enclosing circles.
 * Every option is optional, so `pack()` alone packs one child per row.
 */
export function pack(
  opts: PackOptions,
  marks: MarkChild[] | Promise<MarkChild[]>
): NameableMark<any>;
export function pack(opts?: PackOptions): TranslatableOperator<any[], any[]>;
export function pack(
  opts: PackOptions = {},
  marks?: MarkChild[] | Promise<MarkChild[]>
): NameableMark<any> | TranslatableOperator<any[], any[]> {
  return marks === undefined ? packOperator(opts) : packOperator(opts, marks);
}
