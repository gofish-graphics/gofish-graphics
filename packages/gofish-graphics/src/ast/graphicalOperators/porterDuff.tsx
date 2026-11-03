/**
 * Region compositing (#1267): `union`, `intersect`, `subtract`, `exclude`
 * and `atop`, the set operations over their operands' regions, named after
 * Figma's boolean operations. The IR names are Porter-Duff's (`over`, `in`,
 * `out`, `xor`, `atop`).
 *
 * An operator reads its operands and draws its result; it never draws an
 * operand as itself. An operand's region is its alpha: where it puts ink, at
 * that ink's alpha. A hidden operand (`.hidden()`) gives its shape and no
 * paint, so it only clips, and an operand with `fill: "none"` and no stroke
 * has no interior.
 *
 * - With a `fill` or a `stroke`, the result is one new shape in that paint
 *   (`atop` takes none). It is an exact path when the operator has an exact
 *   outline (`intersect`, of two operands that trace their shape in opaque
 *   paint, one of them convex: `geometry/clip.ts`), and otherwise the fill
 *   drawn over the result's region, which strokes nothing.
 * - With neither, each operand's paint is drawn where the operator keeps it,
 *   and a later operand's kept paint mixes with an earlier one's by
 *   `blendMode` (PiCCL's coverage-blend rule; the layers are
 *   `compositeLayers` in gofish-ir's `display-list/composite.ts`).
 *
 * A result that lies inside its first operand (`intersect`'s, `subtract`'s,
 * `atop`'s) is laid out in the first operand's box and claim and clipped to
 * it; `intersect` takes the overlap of its operands' boxes and claims.
 * `union` and `exclude` take their union.
 */
import type { DisplayList } from "gofish-ir";
import { GoFishAST } from "../_ast";
import { paintOf } from "../displayList/shapeOnly";
import { GoFishNode, placeUnplacedChild } from "../_node";
import type { Placeable, ToPixel } from "../_node";
import { Size, displayTranslate } from "../dims";
import { Extent } from "../extent";
import * as Pwl from "../solver/pwl";
import {
  lowerStyle,
  lowerSubtree,
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
import type { AxisScale } from "../domain";
import type { CoordinateTransform } from "../coordinateTransforms/coord";
import type { BlendMode } from "../blendMode";

type CompositeOperator = DisplayList.CompositeItem["operator"];

/** The paint of a composite's result. Given a `fill` or a `stroke`, the
 *  result is one new shape in it, and the operands give shape only. */
export type CompositePaint = {
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  /** The opacity of the whole result. */
  opacity?: number;
};

/** How a later operand's kept paint mixes with an earlier one's. */
export type CompositeBlend = { blendMode?: BlendMode };

export type UnionOptions = CompositeBlend & CompositePaint;
export type IntersectOptions = CompositeBlend & CompositePaint;
export type SubtractOptions = CompositePaint;
export type ExcludeOptions = CompositePaint;
/** `atop` draws its operands' own paint, so it takes no `fill`. */
export type AtopOptions = CompositeBlend & { opacity?: number };

/** The user-facing name of each operator, for errors. */
const NAMES: Record<CompositeOperator, string> = {
  over: "union",
  in: "intersect",
  out: "subtract",
  xor: "exclude",
  atop: "atop",
};

/** How a composite is laid out: in the union of its operands, in their
 *  overlap, or in its first operand. */
type Sizing = "union" | "overlap" | "first";
const SIZING: Record<CompositeOperator, Sizing> = {
  over: "union",
  xor: "union",
  in: "overlap",
  out: "first",
  atop: "first",
};

function checkArity(operator: CompositeOperator, n: number): void {
  if (operator === "xor" ? n !== 2 : n < 2)
    throw new Error(
      `${NAMES[operator]}: expected ${operator === "xor" ? "exactly two" : "two or more"} operands, got ${n}.`
    );
}

/** Whether a claim reaches nowhere: both sides are -∞, the claim of an
 *  overlay of nothing. */
const claimsNothing = (e: Extent): boolean =>
  Pwl.at(e.ascent, 1) === -Infinity && Pwl.at(e.descent, 1) === -Infinity;

/** The least of σ-affine values: the upper envelope of their negations,
 *  negated. */
const lowest = (vs: Pwl.Value[]): Pwl.Value =>
  Pwl.negate(Pwl.envelope(vs.map(Pwl.negate)));

/**
 * A composite's claim on each axis. `union` takes its operands' union, as
 * `layer` does; `first` its first operand's. `overlap` takes their overlap:
 * a claim is the interval from its descent below data 0 to its ascent above
 * it, so the overlap of claims takes the least of each side. An operand
 * that makes no claim does not narrow it: one that takes the room it is
 * given (no extent), or one that claims nothing here, as a ref placed by its
 * own target does (the claim of an overlay of nothing, `Pwl.envelope([])`,
 * whose sides are both -∞).
 */
function compositeClaim(
  sizing: Sizing,
  childExtents: Size<Extent | undefined>[],
  childSpaces: Size<UnderlyingSpace>[],
  spaces: Size<UnderlyingSpace>
): Size<Extent | undefined> {
  const axis = (a: 0 | 1): Extent | undefined => {
    if (sizing === "union")
      return unionChildExtents(childExtents, childSpaces, a, spaces[a]);
    if (sizing === "first")
      return unionChildExtents(
        [childExtents[0]],
        [childSpaces[0]],
        a,
        spaces[a]
      );
    const claims = childExtents
      .map((e, i) => unionChildExtents([e], [childSpaces[i]], a, spaces[a]))
      .filter((e): e is Extent => e !== undefined && !claimsNothing(e));
    // With no operand that narrows it, the overlap claims what they all do.
    if (claims.length === 0)
      return unionChildExtents(childExtents, childSpaces, a, spaces[a]);
    if (claims.length === 1) return claims[0];
    return Extent(
      lowest(claims.map((c) => c.ascent)),
      lowest(claims.map((c) => c.descent))
    );
  };
  return [axis(0), axis(1)];
}

/** A composite's box on one axis, from its placed operands. */
function compositeBounds(
  sizing: Sizing,
  placed: Placeable[],
  axis: 0 | 1
): { min: number; max: number } {
  const of = (ps: Placeable[]) => ({
    mins: ps.map((p) => p.dims[axis].min ?? 0),
    maxs: ps.map((p) => p.dims[axis].max ?? 0),
  });
  if (sizing === "first") {
    const { mins, maxs } = of([placed[0]]);
    return { min: mins[0], max: maxs[0] };
  }
  const { mins, maxs } = of(placed);
  if (sizing === "union")
    return { min: Math.min(...mins), max: Math.max(...maxs) };
  const min = Math.max(...mins);
  return { min, max: Math.max(min, Math.min(...maxs)) };
}

/** How far the samples of a curved operand may stray from it, in pixels. */
const TOLERANCE = 0.25;

/**
 * A placed operand's region as one exact ring in the composite's frame, or
 * undefined when it has none: its outline must be one closed loop that
 * traces its shape (not a box standing in for an image, a text or a group,
 * `Outline.bounds`). An outline of no pieces is exact and empty (a cell its
 * inset leaves nothing of): the empty ring.
 */
function operandRing(p: Placeable): OutlinePoint[] | undefined {
  const outlines: Outline[] = placedOutlines(
    p as Placeable & { geometry(): any },
    TOLERANCE
  );
  if (outlines.length === 0) return [];
  if (outlines.length !== 1) return undefined;
  const [o] = outlines;
  if (!o.closed || o.bounds) return undefined;
  return openRing(o.points);
}

/**
 * Whether lowered items cover exactly their traced shape: each is a rect,
 * an ellipse or a path filled in opaque paint, with no stroke and no
 * opacity, so its alpha is 1 inside its outline and 0 outside. Only then is
 * an operand's outline its region, and an exact path the result's.
 */
function coversItsOutline(items: DisplayList.DisplayItem[]): boolean {
  return items.every((item) => {
    if (item.kind !== "rect" && item.kind !== "ellipse" && item.kind !== "path")
      return false;
    const s = item.style ?? {};
    return (
      s.fill !== undefined &&
      inks(s.fill) &&
      (s.opacity ?? 1) === 1 &&
      (s.fillOpacity ?? 1) === 1 &&
      (s.stroke === undefined || !inks(s.stroke) || !(s.strokeWidth ?? 0)) &&
      s.mixBlendMode === undefined
    );
  });
}

/**
 * The exact outline of a composite's result in its frame: a ring, an empty
 * list when it is empty, or undefined when there is none. Only `intersect`
 * has one, of two operands (`geometry/clip.ts`): its result is one ring
 * when one operand is convex. A `subtract` or an `exclude` can have holes or
 * several pieces, which one ring cannot hold, and a `union` several pieces
 * (TODO(#1201): exact geometry for them).
 */
function exactResult(
  operator: CompositeOperator,
  placed: readonly Placeable[]
): OutlinePoint[] | undefined {
  if (operator !== "in" || placed.length !== 2) return undefined;
  const a = operandRing(placed[0]);
  if (a?.length === 0) return [];
  const b = a && operandRing(placed[1]);
  if (b?.length === 0) return [];
  return a && b && intersectRings(a, b);
}

/** The loud error for a stroke, or an outline read, that needs exact
 *  geometry the operands do not give. */
const noExactGeometry = (operator: CompositeOperator, what: string) =>
  new Error(
    `${NAMES[operator]}: ${what} needs the exact outline of the result, and ` +
      (operator === "in"
        ? `these operands give none. Exact geometry needs both operands to ` +
          `trace their shape in opaque paint (a rect, ellipse, polygon, ` +
          `ribbon, area or region, or a ref to one; not an image, a text or ` +
          `a group, and no opacity, stroke or fill "none"), and at least ` +
          `one of them to be convex (#1201). Without it, intersect can fill ` +
          `the overlap but not stroke it: drop \`stroke\`, or make an ` +
          `operand one of those shapes.`
        : `only intersect has one yet (#1201): drop \`stroke\`.`)
  );

/**
 * Lower each operand of a composite, a bake boundary, through `toPixel`
 * (the composite's own pixel map), in order, once. A hidden node under the
 * composite lowers as its shape (`GoFishNode.visibility`), so the items are
 * the operand's shape, and its paint is them without what hidden nodes drew
 * (`paintOf`); the shape is kept only where it differs. Each operand's
 * subtree is baked under the node's `translate` (`lowerSubtree`), so an
 * operand that only places its children (a `pack`) lowers its leaves.
 */
function lowerOperands(
  node: GoFishNode,
  translate: [number, number],
  coordinateTransform: CoordinateTransform | undefined,
  toPixel: ToPixel
): DisplayList.CompositeOperand[] {
  const session = node.getRenderSession();
  assertNoPaintOrder(node);
  const saved = session.toPixel;
  session.toPixel = toPixel;
  try {
    return node.children.map((child) => {
      const shape = lowerSubtree(child, translate, coordinateTransform);
      const paint = paintOf(shape);
      return paint === shape ? { paint } : { paint, shape };
    });
  } finally {
    session.toPixel = saved;
  }
}

/** A composite node: `operator` over its children, as the SVG backends draw
 *  it (see the file header). */
function compositeNode(
  operator: CompositeOperator,
  children: GoFishAST[],
  opts: CompositePaint & CompositeBlend
): GoFishNode {
  checkArity(operator, children.length);
  const sizing = SIZING[operator];
  const { blendMode = "normal", ...paint } = opts;
  // The children as laid out, in this node's frame; read again in `lower`
  // and `geometry`, after every node is placed.
  let placed: Placeable[] = [];
  // The exact outline of the result (`exactResult`), worked out on its
  // first read after layout.
  let exact: { ring: OutlinePoint[] | undefined } | undefined;
  const exactRing = () =>
    (exact ??= { ring: exactResult(operator, placed) }).ring;
  const painted = paint.fill !== undefined || paint.stroke !== undefined;
  const strokeWidth = paint.strokeWidth ?? 1;
  const strokes =
    paint.stroke !== undefined && inks(paint.stroke) && strokeWidth > 0;
  // The paint the result is drawn in, read by `lower` and `geometry`: no
  // fill unless one is given, and a stroke width only where the stroke inks.
  const drawn = {
    fill: paint.fill ?? "none",
    stroke: paint.stroke,
    strokeWidth: strokes ? strokeWidth : undefined,
  };
  const node = new GoFishNode(
    {
      type: operator,
      ...(painted && {
        color: isValue(paint.fill) ? paint.fill : paint.stroke,
      }),
      resolveUnderlyingSpace: (
        children: Size<UnderlyingSpace>[],
        _childNodes: readonly GoFishAST[]
      ) => [unionChildSpaces(children, 0), unionChildSpaces(children, 1)],
      resolveExtent: (childExtents, childSpaces, spaces) =>
        compositeClaim(sizing, childExtents, childSpaces, spaces),
      layout: (size, scales, layoutChildren) => {
        placed = layoutComposite(size, scales, layoutChildren);
        exact = undefined;
        const box = (axis: 0 | 1) => {
          const { min, max } = compositeBounds(sizing, placed, axis);
          return { min, size: max - min, center: (min + max) / 2, max };
        };
        return {
          intrinsicDims: [box(0), box(1)],
          transform: { translate: [undefined, undefined] },
        };
      },
      // A composite is a bake boundary, so its children are not lowered
      // before it: it lowers them itself, under its baked translate, and
      // emits one composite item (or, for an exact painted result, one
      // path). Its items are in absolute pixels, like every other item.
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
        const bbox = pixelBox(
          [tx + minX, ty + minY],
          [tx + minX + width, ty + minY + height],
          outer
        );
        const operands = lowerOperands(
          node,
          [tx, ty],
          coordinateTransform,
          outer
        );
        const opacity =
          paint.opacity !== undefined ? { opacity: paint.opacity } : {};

        if (!painted)
          return [
            {
              kind: "composite",
              operator,
              ...(blendMode !== "normal" && { blendMode }),
              bbox,
              operands,
              ...(paint.opacity !== undefined && { style: opacity }),
            },
          ];

        // A new shape in the result's paint; the operands give shape only.
        const shapes = operands.map((o) => o.shape ?? o.paint);
        const unit = session.scaleContext?.unit;
        const style = lowerStyle({
          fill: resolveColorChannel(drawn.fill, unit) ?? "none",
          stroke: resolveColorChannel(drawn.stroke, unit),
          strokeWidth: drawn.strokeWidth,
          ...opacity,
        });
        // One exact path, painted as the composite says, when the outline
        // is exact and every operand's region is its outline.
        const ring = shapes.every(coversItsOutline) ? exactRing() : undefined;
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
        if (strokes) throw noExactGeometry(operator, "a stroke");
        // Otherwise the fill, drawn over the result's region.
        const fill = rectItemFromBox(
          bbox.x,
          bbox.x + bbox.w,
          bbox.y,
          bbox.y + bbox.h,
          (p) => p,
          {
            rx: 0,
            ry: 0,
            style: { ...style, stroke: undefined, strokeWidth: undefined },
            datum: node.datum,
            role: roleFor(node.datum),
          }
        );
        return [
          {
            kind: "composite",
            operator,
            bbox,
            operands: shapes.map((s) => ({ paint: s })),
            fill: [fill],
          },
        ];
      },
      // A painted result's outline is the exact one; reading it when there
      // is none is the loud error. An unpainted composite is read as its
      // box.
      ...(painted && {
        geometry: ({ intrinsicDims }, _children, node) => {
          const box = boxOfDims(intrinsicDims, node.type);
          const outlinePaintOf = outlinePaint(drawn);
          return {
            box,
            outline: () => {
              const ring = exactRing();
              if (ring === undefined)
                throw noExactGeometry(operator, "reading its outline");
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
  node.clipsToBox = sizing !== "union";
  node._readsShapes = true;
  return node;
}

/**
 * Lay out a composite's children in its own frame, as a layer does: it hands
 * them the scales it was given, so their data positions (a `region()`
 * operand's cell, a `ref` operand's target) are in its parent's frame, and
 * places each child that did not place itself at its origin.
 */
function layoutComposite(
  size: Size,
  scales: Size<AxisScale | undefined>,
  children: readonly GoFishAST[]
): Placeable[] {
  const placed = children.map((child) => child.layout(size, scales));
  placed.forEach(placeUnplacedChild);
  return placed;
}

/** union: A ∪ B ∪ .... */
export const union = createNodeOperator(
  (opts: UnionOptions, children: GoFishAST[]) =>
    compositeNode("over", children, opts)
);

/** intersect: A ∩ B ∩ .... */
export const intersect = createNodeOperator(
  (opts: IntersectOptions, children: GoFishAST[]) =>
    compositeNode("in", children, opts)
);

/** subtract: A − B − .... */
export const subtract = createNodeOperator(
  (opts: SubtractOptions, children: GoFishAST[]) =>
    compositeNode("out", children, opts)
);

/** exclude: where exactly one of A and B is. */
export const exclude = createNodeOperator(
  (opts: ExcludeOptions, children: GoFishAST[]) =>
    compositeNode("xor", children, opts)
);

/** atop: A, then each later operand clipped to A. */
export const atop = createNodeOperator(
  (opts: AtopOptions, children: GoFishAST[]) =>
    compositeNode("atop", children, opts)
);
