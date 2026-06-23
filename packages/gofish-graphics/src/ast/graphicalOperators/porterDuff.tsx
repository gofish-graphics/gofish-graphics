import type { DisplayList } from "gofish-ir";
import { GoFishAST } from "../_ast";
import { GoFishNode } from "../_node";
import type { Placeable, ToPixel } from "../_node";
import { Size, displayTranslate } from "../dims";
import { UnderlyingSpace } from "../underlyingSpace";
import { createNodeOperator } from "../withGoFish";
import { unionChildSpaces } from "./alignment";

type BlendMode = "color" | "multiply" | "screen" | "overlay" | "luminosity";
type CompositeOperator = "over" | "in" | "xor" | "out" | "atop";

const requireTwoChildren = <T,>(children: T[]) => {
  if (children.length !== 2) {
    throw new Error(
      "Porter-Duff relation operators currently expect exactly two children"
    );
  }
};

const maxChildBounds = (children: Placeable[]) => {
  const minX = Math.min(...children.map((child) => child.dims[0].min ?? 0));
  const maxX = Math.max(...children.map((child) => child.dims[0].max ?? 0));
  const minY = Math.min(...children.map((child) => child.dims[1].min ?? 0));
  const maxY = Math.max(...children.map((child) => child.dims[1].max ?? 0));
  return { minX, maxX, minY, maxY };
};

const createCompositeRelation = (type: string, operator: CompositeOperator) =>
  createNodeOperator(
    (
      {
        blendMode = "color",
      }: {
        blendMode?: BlendMode;
      },
      children: GoFishAST[]
    ) => {
      requireTwoChildren(children);

      // For Porter-Duff "atop" the result is visually clipped to the first
      // child (the source), so its reported size is the first child's size.
      // Other operators keep the union-based sizing so unions/xors don't
      // clip content outside the first child's bounds.
      const isAtop = operator === "atop";
      return new GoFishNode(
        {
          type,
          shared: [false, false],
          resolveUnderlyingSpace: (
            children: Size<UnderlyingSpace>[],
            _childNodes: GoFishAST[]
          ) => [unionChildSpaces(children, 0), unionChildSpaces(children, 1)],
          layout: (
            _shared,
            size,
            scaleFactors,
            layoutChildren,
            posScales,
            _node
          ) => {
            requireTwoChildren(layoutChildren);

            const childPlaceables = layoutChildren.map((child) =>
              child.layout(size, scaleFactors, posScales)
            );
            childPlaceables.forEach((child) => {
              child.place("x", 0, "baseline");
              child.place("y", 0, "baseline");
            });

            const { minX, maxX, minY, maxY } = isAtop
              ? {
                  minX: childPlaceables[0].dims[0].min ?? 0,
                  maxX: childPlaceables[0].dims[0].max ?? 0,
                  minY: childPlaceables[0].dims[1].min ?? 0,
                  maxY: childPlaceables[0].dims[1].max ?? 0,
                }
              : maxChildBounds(childPlaceables);
            return {
              intrinsicDims: [
                {
                  min: minX,
                  size: maxX - minX,
                  center: minX + (maxX - minX) / 2,
                  max: maxX,
                },
                {
                  min: minY,
                  size: maxY - minY,
                  center: minY + (maxY - minY) / 2,
                  max: maxY,
                },
              ],
              transform: { translate: [undefined, undefined] },
            };
          },
          // IR lowering — mirror of `render`. A composite is a bake boundary,
          // so its children are NOT pre-lowered: we re-walk the two subtrees
          // ourselves, offset by the node's baked translate (the legacy
          // `<g transform>`), and emit one CompositeItem. source = first child
          // (`#…-source`), dest = second (`#…-destination`), matching
          // `renderComposite`'s feImage wiring.
          lower: (
            { intrinsicDims, transform, coordinateTransform },
            _children,
            node
          ): DisplayList.DisplayItem[] => {
            const [tx, ty] = displayTranslate(transform);
            const session = node.getRenderSession();
            const outer = session.toPixel!;

            const minX = intrinsicDims?.[0]?.min ?? 0;
            const minY = intrinsicDims?.[1]?.min ?? 0;
            const width = intrinsicDims?.[0]?.size ?? 0;
            const height = intrinsicDims?.[1]?.size ?? 0;
            // Pixel bbox: the y-up box [tx+minX, …] × [ty+minY, …] mapped
            // through the outer toPixel. The y-up top edge (gyMax) maps to the
            // smaller SVG y, so the top-left corner is toPixel([xMin, yMax]).
            const [bx, by] = outer([tx + minX, ty + minY + height]);

            // The two layers are lowered RELATIVE to the bbox pixel origin, not
            // at absolute pixels. The SVG backend places each layer in a
            // `<feImage>` whose subregion is the filter region (the bbox), and
            // browsers offset a referenced `<feImage>` element BY that region
            // origin — so an absolute-positioned child would double-count it.
            // Legacy `renderComposite` sidestepped this by keeping children in
            // the compositor's local frame (min ≈ 0) with the filter at that
            // same min; we reproduce that by subtracting the bbox origin.
            const composed: ToPixel = ([cx, cy]) => {
              const [ax, ay] = outer([tx + cx, ty + cy]);
              return [ax - bx, ay - by];
            };

            session.toPixel = composed;
            let source: DisplayList.DisplayItem[];
            let dest: DisplayList.DisplayItem[];
            try {
              source = node.children[0].INTERNAL_lower(coordinateTransform);
              dest = node.children[1].INTERNAL_lower(coordinateTransform);
            } finally {
              session.toPixel = outer;
            }

            return [
              {
                kind: "composite",
                operator,
                blendMode,
                bbox: { x: bx, y: by, w: width, h: height },
                source,
                dest,
              },
            ];
          },
        },
        children
      );
    }
  );

/**
 * Region-compositing operators, named after Figma's boolean operations
 * (issues #196 / #202). Each takes **exactly two children** `[A, B]` — the
 * binary SVG-filter implementations below do not generalize to 3+ children,
 * so all of them throw via `requireTwoChildren` when given any other arity.
 * The maintainer's notation in #196 describes the eventual n-ary semantics;
 * the current arity behavior is binary-only and documented honestly per op.
 *
 * `over` is intentionally NOT exported from the public surface: it is
 * conceptually `layer` (`A ∪ B`, see #196) and is kept internal only so the
 * IR deserializer (serialize/registry) can still dispatch the `"over"` wire
 * type. Prefer `layer` in user code.
 */

/**
 * Internal-only `A ∪ B` union compositing. Exported for the IR deserializer
 * (serialize/registry) to dispatch the `"over"` wire type, but intentionally
 * NOT re-exported from `lib.ts` — use `layer` in user code.
 */
export const over = createCompositeRelation("over", "over");

/**
 * intersect — draw only where both regions overlap: `A ∩ B`.
 * Binary only (exactly two children); the n-ary form `A ∩ B ∩ ...` is not
 * yet implemented.
 */
export const intersect = createCompositeRelation("in", "in");

/**
 * exclude — draw the symmetric difference (odd-overlap parity): `A ^ B`.
 * Binary only (exactly two children). The n-ary parity form `A ^ B ^ ...`
 * (drawn where an odd number of regions overlap) is not yet implemented.
 */
export const exclude = createCompositeRelation("xor", "xor");

/**
 * subtract — draw A with B removed: `A − B`.
 * Binary only (exactly two children); the n-ary fold `A − B − C − ...` is
 * not yet implemented.
 */
export const subtract = createCompositeRelation("out", "out");

/**
 * paint — A is a base surface that B is painted onto, clipped to A:
 * `A ∪ (B ∩ A)`. The result is sized to A (the first child). Binary only
 * (exactly two children); the n-ary form `A ∪ (B ∩ A) ∪ (C ∩ A) ∪ ...` is
 * not yet implemented.
 */
export const paint = createCompositeRelation("atop", "atop");

/**
 * mask — use A's region as a clip and paint B inside it **without drawing A
 * itself**: `B ∩ A`, reporting A's bounds. Binary only (exactly two
 * children). Differs from `paint` in that A is a clip region, not a surface.
 */
export const mask = createNodeOperator(
  (_: Record<string, never>, children: GoFishAST[]) => {
    requireTwoChildren(children);

    return new GoFishNode(
      {
        type: "mask",
        shared: [false, false],
        resolveUnderlyingSpace: (
          children: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[]
        ) => [unionChildSpaces(children, 0), unionChildSpaces(children, 1)],
        layout: (
          _shared,
          size,
          scaleFactors,
          layoutChildren,
          posScales,
          _node
        ) => {
          requireTwoChildren(layoutChildren);

          const childPlaceables = layoutChildren.map((child) =>
            child.layout(size, scaleFactors, posScales)
          );
          childPlaceables.forEach((child) => {
            child.place("x", 0, "baseline");
            child.place("y", 0, "baseline");
          });

          // Mask reports the first child's bounds — visually only the mask
          // shape (first child) defines the opaque region, so reporting the
          // union with the destination would over-state the visible bbox.
          const minX = childPlaceables[0].dims[0].min ?? 0;
          const maxX = childPlaceables[0].dims[0].max ?? 0;
          const minY = childPlaceables[0].dims[1].min ?? 0;
          const maxY = childPlaceables[0].dims[1].max ?? 0;
          return {
            intrinsicDims: [
              {
                min: minX,
                size: maxX - minX,
                center: minX + (maxX - minX) / 2,
                max: maxX,
              },
              {
                min: minY,
                size: maxY - minY,
                center: minY + (maxY - minY) / 2,
                max: maxY,
              },
            ],
            transform: { translate: [undefined, undefined] },
          };
        },
        // IR lowering — mirror of `render`. A mask is a bake boundary, so we
        // re-walk both subtrees offset by the node's baked translate (the
        // legacy `<g transform>`) and emit one MaskItem. mask = first child
        // (the clip region, `#…-source`), content = second child
        // (`#…-destination`), matching the render's mask/use wiring.
        lower: (
          { intrinsicDims, transform, coordinateTransform },
          _children,
          node
        ): DisplayList.DisplayItem[] => {
          const [tx, ty] = displayTranslate(transform);
          const session = node.getRenderSession();
          const outer = session.toPixel!;
          const composed: ToPixel = ([cx, cy]) => outer([tx + cx, ty + cy]);

          session.toPixel = composed;
          let maskItems: DisplayList.DisplayItem[];
          let content: DisplayList.DisplayItem[];
          try {
            maskItems = node.children[0].INTERNAL_lower(coordinateTransform);
            content = node.children[1].INTERNAL_lower(coordinateTransform);
          } finally {
            session.toPixel = outer;
          }

          const minX = intrinsicDims?.[0]?.min ?? 0;
          const minY = intrinsicDims?.[1]?.min ?? 0;
          const width = intrinsicDims?.[0]?.size ?? 0;
          const height = intrinsicDims?.[1]?.size ?? 0;
          const [bx, by] = outer([tx + minX, ty + minY + height]);

          return [
            {
              kind: "mask",
              bbox: { x: bx, y: by, w: width, h: height },
              mask: maskItems,
              content,
            },
          ];
        },
      },
      children
    );
  }
);
