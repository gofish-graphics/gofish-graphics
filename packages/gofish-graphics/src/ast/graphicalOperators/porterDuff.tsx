import type { DisplayList } from "gofish-ir";
import { GoFishAST } from "../_ast";
import { GoFishNode, placeUnplacedChild } from "../_node";
import type { Placeable, ToPixel } from "../_node";
import { Size, displayTranslate } from "../dims";
import type { Extent } from "../extent";
import {
  lowerStyle,
  pixelBox,
  rectItemFromBox,
  ringItem,
  roleFor,
} from "../displayList/lowerHelpers";
import { UnderlyingSpace } from "../underlyingSpace";
import { createNodeOperator } from "../withGoFish";
import { unionChildExtents, unionChildSpaces } from "./alignment";
import { assertNoPaintOrder } from "../paintOrder";
import { resolveColorChannel } from "../../color";
import { isValue, type MaybeValue } from "../data";
import {
  boxOfDims,
  intersectRings,
  openRing,
  outlinePaint,
  placedOutlines,
  ringOutline,
  type Outline,
  type OutlinePoint,
} from "../geometry";
import { inks } from "../geometry/outline";
import type { Region } from "../geometry/region";
import type { AxisScale } from "../domain";

type BlendMode = "color" | "multiply" | "screen" | "overlay" | "luminosity";
type CompositeOperator = "over" | "in" | "xor" | "out" | "atop";

/** The paint a composite puts on its result (`intersect`'s `fill`,
 *  `stroke`, `strokeWidth`, `opacity`). Its operands then give shape only. */
export type CompositePaint = {
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  opacity?: number;
};

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

/**
 * The claim of a composite clipped to its first child (`paint`, `mask`): the
 * first child's claim, as the box it lays out to is the first child's box.
 * The second child is drawn only inside the first, so it takes no room of
 * its own (a cut slice is its window, not the whole source it shows a part
 * of).
 */
const firstChildClaim = (
  childExtents: Size<Extent | undefined>[],
  childSpaces: Size<UnderlyingSpace>[],
  spaces: Size<UnderlyingSpace>
): Size<Extent | undefined> => [
  unionChildExtents([childExtents[0]], [childSpaces[0]], 0, spaces[0]),
  unionChildExtents([childExtents[0]], [childSpaces[0]], 1, spaces[1]),
];

/**
 * Lay out a composite's children in its own frame. A composite has no frame
 * of its own: it hands its children the scales it was given, so their data
 * positions are in its parent's frame. So it hands them the region it was
 * given as it came (a `region()` operand fills a partition's cell), places
 * each child that did not place itself at its origin (a `ref` operand is
 * already where its target is), and sits at 0 on each axis the region gives
 * a span, rather than being centered in it.
 */
function layoutComposite(
  size: Size,
  scales: Size<AxisScale | undefined>,
  children: GoFishAST[],
  region: Region | undefined
): {
  placed: Placeable[];
  translate: [number | undefined, number | undefined];
} {
  requireTwoChildren(children);
  const placed = children.map((child) =>
    child instanceof GoFishNode
      ? child.layout(size, scales, region)
      : child.layout(size, scales)
  );
  placed.forEach(placeUnplacedChild);
  const at = (axis: 0 | 1) =>
    region?.spans[axis] !== undefined ? 0 : undefined;
  return { placed, translate: [at(0), at(1)] };
}

/** How far the samples of a curved operand may stray from it, in pixels. */
const TOLERANCE = 0.25;

/**
 * A placed operand's region as one exact ring in the composite's frame, or
 * undefined when it has none: its outline must be one closed loop that
 * traces its shape (not a box standing in for an image, a text or a group,
 * `Outline.bounds`). Its paint does not matter: an operand gives shape only.
 */
function operandRing(p: Placeable): OutlinePoint[] | undefined {
  const outlines: Outline[] = placedOutlines(
    p as Placeable & { geometry(): any },
    TOLERANCE
  );
  if (outlines.length !== 1) return undefined;
  const [o] = outlines;
  if (!o.closed || o.bounds) return undefined;
  return openRing(o.points);
}

/**
 * The exact outline of `A ∩ B` in the composite's frame: a ring, an empty
 * list when they do not overlap, or undefined when there is no exact answer
 * (an operand without an exact outline, or two non-convex operands; see
 * `geometry/clip.ts`).
 */
function exactIntersection(
  placed: readonly Placeable[]
): OutlinePoint[] | undefined {
  const a = operandRing(placed[0]);
  const b = a && operandRing(placed[1]);
  return a && b && intersectRings(a, b);
}

/** The loud error for a stroke, or an outline read, that needs exact
 *  geometry the operands do not give. */
const noExactGeometry = (what: string) =>
  new Error(
    `intersect: ${what} needs the exact outline of the result, and these ` +
      `operands give none. Exact geometry needs both operands to trace their ` +
      `shape (a rect, ellipse, polygon, ribbon, area or region, or a ref to ` +
      `one; not an image, a text or a group), and at least one of them to be ` +
      `convex (#1201). Without it, intersect can fill the overlap but not ` +
      `stroke it: drop \`stroke\`, or make an operand one of those shapes.`
  );

/**
 * A composite node: `operator` over two children, as the SVG backends draw
 * it. With `paint` (only `intersect` takes it), the result is the region
 * `A ∩ B` drawn in that paint, and the operands give shape only: one exact
 * path when the operands have exact outlines, else the operands' ink as an
 * alpha mask over a fill. Without it, the operands are composited with their
 * own paint, as before.
 */
function compositeNode(
  type: string,
  operator: CompositeOperator,
  blendMode: BlendMode,
  children: GoFishAST[],
  paint?: CompositePaint
): GoFishNode {
  requireTwoChildren(children);
  // For Porter-Duff "atop" the result is visually clipped to the first
  // child (the source), so its reported size is the first child's size.
  // Other operators keep the union-based sizing so unions/xors don't
  // clip content outside the first child's bounds.
  const isAtop = operator === "atop";
  // The children as laid out, in this node's frame; read again in `lower`
  // and `geometry`, after every node is placed.
  let placed: Placeable[] = [];
  const painted =
    paint !== undefined &&
    (paint.fill !== undefined || paint.stroke !== undefined);
  const stroke = paint?.stroke;
  const strokeWidth = paint?.strokeWidth ?? 1;
  const strokes = stroke !== undefined && inks(stroke) && strokeWidth > 0;
  const node = new GoFishNode(
    {
      type,
      ...(painted && {
        color: isValue(paint!.fill) ? paint!.fill : paint!.stroke,
      }),
      resolveUnderlyingSpace: (
        children: Size<UnderlyingSpace>[],
        _childNodes: GoFishAST[]
      ) => [unionChildSpaces(children, 0), unionChildSpaces(children, 1)],
      resolveExtent: (childExtents, childSpaces, spaces) =>
        isAtop
          ? firstChildClaim(childExtents, childSpaces, spaces)
          : [
              unionChildExtents(childExtents, childSpaces, 0, spaces[0]),
              unionChildExtents(childExtents, childSpaces, 1, spaces[1]),
            ],
      layout: (size, scales, layoutChildren, _node, region) => {
        const laid = layoutComposite(size, scales, layoutChildren, region);
        placed = laid.placed;
        const childPlaceables = placed;

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
          transform: { translate: laid.translate },
        };
      },
      // IR lowering — mirror of `render`. A composite is a bake boundary,
      // so its children are NOT pre-lowered: we re-walk the two subtrees
      // ourselves, offset by the node's baked translate (the legacy
      // `<g transform>`), and emit one CompositeItem. source = first child
      // (`#…-source`), dest = second (`#…-destination`), matching the SVG
      // backends' `composite` source/destination group ids.
      lower: (
        { intrinsicDims, transform, coordinateTransform, toPixel, local },
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
        // Pixel bbox top-left and size (see `pixelBox`).
        const {
          x: bx,
          y: by,
          w: bw,
          h: bh,
        } = pixelBox(
          [tx + minX, ty + minY],
          [tx + minX + width, ty + minY + height],
          outer
        );

        if (painted) {
          const unit = session.scaleContext?.unit;
          const style = lowerStyle({
            fill: resolveColorChannel(paint!.fill, unit) ?? "none",
            stroke: resolveColorChannel(stroke, unit),
            strokeWidth: strokes ? strokeWidth : undefined,
            opacity: paint!.opacity,
          });
          // One exact path, painted as the composite says.
          const ring = exactIntersection(placed);
          if (ring !== undefined) {
            if (ring.length === 0) return [];
            return [
              ringItem(
                ring.map((p) => local(p)),
                coordinateTransform,
                toPixel,
                node.datum,
                style
              ),
            ];
          }
          if (strokes) throw noExactGeometry("a stroke");
          // No exact outline: fill the overlap of the two operands' ink, an
          // alpha mask of each over a fill of the box.
          const composed: ToPixel = ([cx, cy]) => outer([tx + cx, ty + cy]);
          assertNoPaintOrder(node);
          session.toPixel = composed;
          let a: DisplayList.DisplayItem[];
          let b: DisplayList.DisplayItem[];
          try {
            a = node.children[0].INTERNAL_lower(coordinateTransform);
            b = node.children[1].INTERNAL_lower(coordinateTransform);
          } finally {
            session.toPixel = outer;
          }
          const bbox = { x: bx, y: by, w: bw, h: bh };
          const fillRect = rectItemFromBox(bx, bx + bw, by, by + bh, (p) => p, {
            rx: 0,
            ry: 0,
            style: { ...style, stroke: undefined, strokeWidth: undefined },
            datum: node.datum,
            role: roleFor(node.datum),
          });
          return [
            {
              kind: "mask",
              mode: "alpha",
              bbox,
              mask: a,
              content: [
                {
                  kind: "mask",
                  mode: "alpha",
                  bbox,
                  mask: b,
                  content: [fillRect],
                },
              ],
            },
          ];
        }

        // The two layers are lowered RELATIVE to the bbox pixel origin, not
        // at absolute pixels: both SVG backends wrap the composited layers
        // in a `<g transform="translate(bbox.x bbox.y)">` (see
        // `paintSVG`'s / `render.ts`'s `composite` case), so child
        // coordinates must start near the bbox's own origin rather than
        // the document's. We reproduce that by subtracting the bbox origin.
        const composed: ToPixel = ([cx, cy]) => {
          const [ax, ay] = outer([tx + cx, ty + cy]);
          return [ax - bx, ay - by];
        };

        assertNoPaintOrder(node);
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
            bbox: { x: bx, y: by, w: bw, h: bh },
            source,
            dest,
          },
        ];
      },
      // A painted result's outline is the exact intersection; reading it
      // when there is none is the loud error. An unpainted composite is read
      // as its box, as before.
      ...(painted && {
        geometry: ({ intrinsicDims }, _children, node) => {
          const box = boxOfDims(intrinsicDims, node.type);
          const outlinePaintOf = outlinePaint({
            fill: paint!.fill ?? "none",
            stroke,
            strokeWidth: strokes ? strokeWidth : 0,
          });
          return {
            box,
            outline: () => {
              const ring = exactIntersection(placed);
              if (ring === undefined)
                throw noExactGeometry("reading its outline");
              return ring.length === 0
                ? []
                : [ringOutline(ring, node.yFrame.direction, outlinePaintOf)];
            },
          };
        },
      }),
    },
    children
  );
  node.clipsToBox = isAtop;
  return node;
}

const createCompositeRelation = (type: string, operator: CompositeOperator) =>
  createNodeOperator(
    (
      {
        blendMode = "color",
      }: {
        blendMode?: BlendMode;
      },
      children: GoFishAST[]
    ) => compositeNode(type, operator, blendMode, children)
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
 *
 * With `fill` or `stroke`, the result is the region `A ∩ B` in that paint,
 * and the operands give shape only (`compositeNode`). Without them, the
 * operands keep their own paint (issue #1230 tracks that default).
 *
 * TODO: `subtract` and `exclude` take no paint yet. Their exact result can
 * have holes or several pieces, which one outline cannot hold (#1201), and
 * their mask fill needs an inverse-alpha mask.
 */
export const intersect = createNodeOperator(
  (
    {
      blendMode = "color",
      fill,
      stroke,
      strokeWidth,
      opacity,
    }: { blendMode?: BlendMode } & CompositePaint,
    children: GoFishAST[]
  ) =>
    compositeNode("in", "in", blendMode, children, {
      fill,
      stroke,
      strokeWidth,
      opacity,
    })
);

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

    const node = new GoFishNode(
      {
        type: "mask",
        resolveUnderlyingSpace: (
          children: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[]
        ) => [unionChildSpaces(children, 0), unionChildSpaces(children, 1)],
        resolveExtent: firstChildClaim,
        layout: (size, scales, layoutChildren) => {
          requireTwoChildren(layoutChildren);

          const childPlaceables = layoutChildren.map((child) =>
            child.layout(size, scales)
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

          assertNoPaintOrder(node);
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
          // Flip-agnostic bbox top-left — see `pixelBox` / the compositor (#143/#16).
          const {
            x: bx,
            y: by,
            w: bw,
            h: bh,
          } = pixelBox(
            [tx + minX, ty + minY],
            [tx + minX + width, ty + minY + height],
            outer
          );

          return [
            {
              kind: "mask",
              bbox: { x: bx, y: by, w: bw, h: bh },
              mask: maskItems,
              content,
            },
          ];
        },
      },
      children
    );
    node.clipsToBox = true;
    return node;
  }
);
