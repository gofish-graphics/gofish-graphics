import { GoFishNode, placeUnplacedChild } from "../_node";
import { Size, displayTranslate } from "../dims";
import type { DisplayList } from "gofish-ir";
import {
  lowerChildrenOffset,
  lowerStyle,
  rectItemFromBox,
} from "../displayList/lowerHelpers";
import { GoFishAST } from "../_ast";
import { gray } from "../../color";
import { Domain } from "../domain";
import { foldFinite } from "../../util";
import { UNDEFINED, UnderlyingSpace } from "../underlyingSpace";
import { createNodeOperator } from "../withGoFish";

export const enclose = createNodeOperator(
  (
    {
      padding = 2,
      rx = 2,
      ry = 2,
      fill = "none",
      stroke = gray,
      strokeWidth = 1,
      strokeDasharray,
      opacity = 1,
    }: {
      padding?: number;
      rx?: number;
      ry?: number;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      strokeDasharray?: string;
      opacity?: number;
    },
    children: GoFishAST[]
  ) => {
    return new GoFishNode(
      {
        type: "enclose",
        shared: [false, false],
        resolveUnderlyingSpace: (
          children: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[]
        ) => {
          return [UNDEFINED, UNDEFINED];
        },
        layout: (shared, size, scales, children) => {
          // Child placement mirrors `layer`'s own rule exactly (see
          // `placeUnplacedChild` in `_node.ts`, reused here rather than
          // re-derived): a FRESH child (e.g. a plain shape) reports an
          // undefined translate until placed, so it gets `layer`'s usual
          // baseline-origin placement. An ALREADY-PLACED operand — most
          // notably a `ref(...)` child, which reconciles its own translate
          // against its LCA during its own `layout()` (see `GoFishRef.layout`
          // in `_ref.tsx`) — must NOT be re-placed: `GoFishRef.place()` has no
          // ledger to make that a no-op, so calling it would collapse every
          // ref onto one point (see `enclose({}, [ref("1"), ref("2"), ...])`
          // used to do). Enclose's own contribution beyond `layer` is purely
          // the hull/bbox union + padding below, read from each child's ACTUAL
          // (placed) box — the same union `layer` folds over `childPlaceables`.
          const childPlaceables = [];

          for (const child of children) {
            const childPlaceable = child.layout(size, scales);
            placeUnplacedChild(childPlaceable);
            childPlaceables.push(childPlaceable);
          }

          const minX = foldFinite(
            childPlaceables.map((cp) => cp.dims[0].min),
            Math.min
          );
          const maxX = foldFinite(
            childPlaceables.map((cp) => cp.dims[0].max),
            Math.max
          );
          const minY = foldFinite(
            childPlaceables.map((cp) => cp.dims[1].min),
            Math.min
          );
          const maxY = foldFinite(
            childPlaceables.map((cp) => cp.dims[1].max),
            Math.max
          );

          return {
            intrinsicDims: {
              x: minX - padding,
              y: minY - padding,
              w: maxX - minX + padding * 2,
              h: maxY - minY + padding * 2,
            },
            transform: { translate: [undefined, undefined] },
          };
        },
        // IR lowering — the enclosure rect paints FIRST (a true background
        // behind the content), then the children under the node's translate
        // (the legacy `<g transform>`) on top.
        lower: (
          { intrinsicDims, transform, coordinateTransform },
          _children,
          node
        ): DisplayList.DisplayItem[] => {
          const childItems = lowerChildrenOffset(
            node,
            transform,
            coordinateTransform
          );
          const [tx, ty] = displayTranslate(transform);
          const outer = node.getRenderSession().toPixel!;

          const localMinX = intrinsicDims?.[0]?.min ?? -padding;
          const localMinY = intrinsicDims?.[1]?.min ?? -padding;
          const w = intrinsicDims?.[0]?.size ?? 0;
          const h = intrinsicDims?.[1]?.size ?? 0;
          // Enclosure rect at local (localMinX, localMinY, w, h) — the hull's
          // own box (children's bbox union ± padding; see `layout` above),
          // inside the node's translate → absolute y-up box, mapped via the
          // outer toPixel. `localMinX/Y` collapse to `-padding` in the common
          // (all-fresh-children) case, matching the old hardcoded assumption.
          const box = rectItemFromBox(
            tx + localMinX,
            tx + localMinX + w,
            ty + localMinY,
            ty + localMinY + h,
            outer,
            {
              rx,
              ry,
              role: "overlay",
              style: lowerStyle({
                fill,
                stroke,
                strokeWidth,
                strokeDasharray,
                opacity,
              }),
            }
          );
          return [box, ...childItems];
        },
      },
      children
    );
  }
);
