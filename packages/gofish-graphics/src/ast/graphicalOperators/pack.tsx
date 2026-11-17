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
import { Extent } from "../extent";
import * as Pwl from "../solver/pwl";

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
 * It fits itself to its room when every child's radius comes from data
 * (#967). The packing scales exactly (multiplying every radius by k
 * multiplies the layout by k), so such a pack's enclosing radius is
 * `R(1)·σ`, where `R(1)` is the radius of the pack of the children's radius
 * claims at σ = 1 (`GoFishNode.enclosingRadius`). It answers that radius
 * claim, and claims `2·R(1)·σ` on each axis, so the scope around it solves
 * σ and the pack fills its room. Children with pixel radii only give a
 * constant radius and claim no room, as before.
 *
 * Its outline is its children's outlines, so an `enclose` around a pack hugs
 * what it packed, not the pack's box. TODO(#1233): every node with children
 * should answer its outline this way; only pack does so far.
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
    const node: GoFishNode = new GoFishNode(
      {
        type: "pack",
        args: { key },
        key,
        // Its children are its own separate spaces, so it has no data axis.
        // Its room comes from its claim (below).
        resolveUnderlyingSpace: (): Size<UnderlyingSpace> => [
          UNDEFINED,
          UNDEFINED,
        ],
        // Its enclosing radius before layout, packed from its children's.
        // Pixel radii only are a constant: pack them as layout will. Data
        // radii only, with no spacing, are linear: one pack at σ = 1.
        // TODO(#967): pixel and data radii mixed, or data radii with a pixel
        // `spacing`, give a radius that is no line in σ (`r_i = a_i·σ + b_i`
        // packs to no closed form), so such a pack has no radius claim, claims
        // no room, and cannot lay out its data radii. It needs a claim kind
        // that is not closed form (a monotone function inverted by search, as
        // issue #967 describes); this effort adds none.
        resolveEnclosingRadius: (childAsts) => {
          const radii: Pwl.Affine[] = [];
          for (const child of childAsts) {
            const r =
              child instanceof GoFishNode ? child.enclosingRadius() : undefined;
            if (r === undefined || !Pwl.isAffine(r)) return undefined;
            radii.push(r);
          }
          if (radii.every((r) => r.slope === 0))
            return Pwl.constant(
              packCircles(
                radii.map((r) => r.intercept),
                pad
              ).R
            );
          if (pad === 0 && radii.every((r) => r.intercept === 0))
            return Pwl.affine(
              packCircles(
                radii.map((r) => r.slope),
                0
              ).R,
              0
            );
          return undefined;
        },
        // A pack whose radius grows with σ claims its circle's square, so the
        // scope around it fits it; any other claims no room, and its size is
        // whatever its children's pixel sizes pack into.
        resolveExtent: () => {
          const r = node.enclosingRadius();
          if (r === undefined || Pwl.isConstant(r))
            return [undefined, undefined];
          const side = Extent(Pwl.scale(2, r));
          return [side, side];
        },
        layout: (size, scales, childAsts) => {
          const placed = childAsts.map((child) => child.layout(size, scales));
          const local = placed.map((p) => enclosingCircle(p.geometry()));
          for (const c of local) {
            if (!Number.isFinite(c.r) || c.r < 0)
              throw new Error(
                "[gofish] pack: a child has no pixel size. pack fits data " +
                  "radii only when every child's radius is data and " +
                  "`spacing` is 0; it cannot yet mix data radii with pixel " +
                  "radii or a pixel spacing (#967)."
              );
          }

          const { at, ex, ey, R } = packCircles(
            local.map((c) => c.r),
            pad
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
    return node;
  }
);

/**
 * Pack circles of radii `radii` in data order, each grown by `pad`, so
 * neighbors keep `2·pad` apart (d3's front chain, `packSiblings`). Returns
 * each circle's center with its own radius (`at`), and the smallest circle
 * around the circles themselves (not their grown circles), so the spacing is
 * between siblings only: a pack carries no margin past its outermost
 * children. Its center `(ex, ey)` is d3's, and its radius `R` is measured
 * about it rather than taken from d3, so every circle lies inside it exactly.
 * The claim and the layout both pack through here, so they agree.
 */
const packCircles = (radii: readonly number[], pad: number) => {
  const packed = packSiblings(radii.map((r) => ({ r: r + pad })));
  const at = packed.map((c, i) => ({ x: c.x, y: c.y, r: radii[i] }));
  // (d3 encloses no circles in nothing; an empty pack is a point.)
  const { x: ex, y: ey } = packEnclose(at) ?? { x: 0, y: 0 };
  const R = at.reduce(
    (m, c) => Math.max(m, Math.hypot(c.x - ex, c.y - ey) + c.r),
    0
  );
  return { at, ex, ey, R };
};

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
