// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

import { packSiblings } from "d3-hierarchy";

import { GoFishNode } from "../_node";
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
import { boxOfDims, enclosingCircle } from "../geometry";

/**
 * How `pack` packs its children. A strategy is a plain object made by a
 * function call (`circles()`), so it crosses the Python bridge as IR and can
 * take parameters later. `kind` names the strategy.
 */
export type PackMethod = { kind: "circles" };

/**
 * Pack each child's enclosing circle with d3's front-chain algorithm
 * (`packSiblings`, Wang et al. 2006). Takes no options yet; padding is #967.
 */
export const circles = (): PackMethod => ({ kind: "circles" });

type PackProps = {
  key?: string;
  method?: PackMethod;
};

/**
 * pack: place children so their enclosing circles touch and do not overlap,
 * then report the smallest circle around them as this node's box.
 *
 * A foreign layout, like `treemap`: it lays out each child, reads the child's
 * geometry, runs d3, and `place()`s each child. The children keep the pixel
 * size they lay out at, and the pack's size follows from them.
 */
export const Pack = createNodeOperator(
  (opts: PackProps, children: GoFishAST[]) => {
    const { key, method = circles() } = opts;
    return new GoFishNode(
      {
        type: "pack",
        args: { key, method },
        key,
        shared: [false, false],
        // TODO(#967): pack does not fit itself to the available size; radii stay in pixels. See issue #967.
        // Its size is whatever its children's pixel sizes pack into, which is
        // what a literal-sized shape reports: no data-driven extent.
        resolveUnderlyingSpace: (): Size<UnderlyingSpace> => [
          UNDEFINED,
          UNDEFINED,
        ],
        layout: (_shared, size, scales, childAsts) => {
          if (method.kind !== "circles")
            throw new Error(
              `[gofish] pack: unknown method kind "${(method as { kind: string }).kind}"`
            );

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

          // Circles in data order; packSiblings writes x, y relative to the
          // center of the circle enclosing them all.
          const packed = packSiblings(local.map((c) => ({ r: c.r })));
          // The enclosing radius about that center. Computed here rather than
          // re-running d3's enclose, so every child lies inside it exactly.
          const R = packed.reduce(
            (m, c) => Math.max(m, Math.hypot(c.x, c.y) + c.r),
            0
          );

          placed.forEach((p, i) => {
            const box = p.geometry().box;
            // Land the child's circle center at (R + x, R + y): place the
            // child's box min at that point less the center's offset from it.
            p.place(0, R + packed[i].x - (local[i].cx - box.min[0]), "min");
            p.place(1, R + packed[i].y - (local[i].cy - box.min[1]), "min");
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
          };
        },
      },
      children
    );
  }
);

export type PackOptions = {
  /** Field to partition rows by (like `spread`/`scatter`); also accepts a
   *  `field(...)` accessor. Without `by`, one child per row. */
  by?: SplitBy;
  /** The packing strategy. Default `circles()`. */
  method?: PackMethod;
};

const packOperator = createOperator<any, PackOptions>(
  ((props: PackProps, children: GoFishAST[]) => Pack(props, children)) as any,
  {
    split: ({ by }, d) =>
      by ? splitEntries(by, d) : new Map(d.map((r, i) => [i, r])),
    serialize: "pack",
  }
);

/**
 * Pack the flow's groups (or rows, without `by`) by their enclosing circles.
 * Every option is optional, so `pack()` alone packs one child per row with
 * `circles()`.
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
