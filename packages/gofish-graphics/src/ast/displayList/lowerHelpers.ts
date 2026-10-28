// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Rendering — /internals/core/rendering
// </gofish-wiki>

/**
 * Shared helpers for per-primitive `lower` bodies — the IR counterparts of the
 * small JSX-emitting snippets each shape's `render` uses. Keeping them here
 * means rect/ellipse/petal/connect/coord lower their warped paths identically.
 */

import type { DisplayList } from "gofish-ir";
import type { GoFishNode, ToPixel } from "../_node";
import type { GoFishAST } from "../_ast";
import type { CoordinateTransform } from "../coordinateTransforms/coord";
import { displayTranslate, type Transform } from "../dims";
import {
  path,
  transformPath,
  type Path,
  type Point,
  pathToSVGPath,
} from "../../path";
import { bakeChildren, bakeSubtree } from "../coordinateTransforms/bake";

/**
 * The display-list `role` of a lowered item, derived from whether it is
 * data-bound. `role` is a *projection of datum-presence*: an item that carries a
 * `datum` is a data mark (`"node"` — a hit target); an item with no datum is
 * generated chrome / decoration (`"overlay"` — axes, legends, annotations,
 * value labels). Defining role this way keeps the two fields from ever
 * disagreeing, so a host can trust `role` alone to split data from chrome
 * without also inspecting `datum`. Shape `lower` bodies call this instead of
 * hard-coding `role: "node"`, which previously mis-tagged datum-less chrome.
 * An empty datum (a group a filter emptied) is still data.
 */
export const roleFor = (
  datum: readonly unknown[] | undefined
): DisplayList.DisplayItem["role"] =>
  datum !== undefined ? "node" : "overlay";

/** Map every point of a path through `toPixel`, then serialize to an SVG `d`.
 *  `toPixel` is a translate, so no resampling is needed. */
export const pathToPixelSVG = (path: Path, toPixel: ToPixel): string =>
  pathToSVGPath(
    path.map((seg) =>
      seg.type === "line"
        ? {
            type: "line",
            points: [toPixel(seg.points[0]), toPixel(seg.points[1])] as [
              Point,
              Point,
            ],
          }
        : {
            type: "bezier",
            start: toPixel(seg.start),
            control1: toPixel(seg.control1),
            control2: toPixel(seg.control2),
            end: toPixel(seg.end),
          }
    )
  );

/** A closed ring of layout points as a path item, drawn straight under a
 *  linear coordinate space and adaptively resampled under any other, so a
 *  straight edge in data space draws as the curve the space makes of it.
 *  Shared by the polygon and region lower bodies. */
export const ringItem = (
  points: Point[],
  coordinateTransform: CoordinateTransform | undefined,
  toPixel: ToPixel,
  datum: Record<string, unknown>[] | undefined,
  style: DisplayList.Style
): DisplayList.PathItem => {
  const ring = path(points, { closed: true });
  const drawn =
    coordinateTransform === undefined || coordinateTransform.type === "linear"
      ? ring
      : transformPath(ring, coordinateTransform, { resample: true });
  return {
    kind: "path",
    d: pathToPixelSVG(drawn, toPixel),
    datum,
    role: roleFor(datum),
    style,
  };
};

/** Map the two diagonal corners of an axis-aligned box through `toPixel` and
 *  return the SVG rect: top-left = component-wise min, w/h = abs of the mapped
 *  span. Shared by the rect / image / compositor lower bodies. */
export const pixelBox = (
  c0: Point,
  c1: Point,
  toPixel: ToPixel
): { x: number; y: number; w: number; h: number } => {
  const [ax, ay] = toPixel(c0);
  const [bx, by] = toPixel(c1);
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    w: Math.abs(bx - ax),
    h: Math.abs(by - ay),
  };
};

/** A rect's corner radii as in SVG: one of `rx` / `ry` given is both, and
 *  neither is `fallback` (0 for `rect`, 2 for `Shape.box`). An explicit 0
 *  stays 0. */
export const cornerRadii = (
  rx: number | undefined,
  ry: number | undefined,
  fallback: number
): { rx: number; ry: number } => ({
  rx: rx ?? ry ?? fallback,
  ry: ry ?? rx ?? fallback,
});

/** Build a `RectItem` from a GoFish box (min/max per axis) — see {@link pixelBox}. */
export const rectItemFromBox = (
  gxMin: number,
  gxMax: number,
  gyMin: number,
  gyMax: number,
  toPixel: ToPixel,
  extra: Partial<DisplayList.RectItem> = {}
): DisplayList.RectItem => ({
  kind: "rect",
  ...pixelBox([gxMin, gyMin], [gxMax, gyMax], toPixel),
  ...extra,
});

/** Assemble a `Style` from resolved presentation values, dropping undefined
 *  keys (and a zero/undefined stroke-width, which the legacy render omitted). */
export const lowerStyle = (vals: {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  fillOpacity?: number;
  mixBlendMode?: string;
  strokeDasharray?: string;
  filter?: string;
}): DisplayList.Style => {
  const style: DisplayList.Style = {};
  if (vals.fill !== undefined) style.fill = vals.fill;
  if (vals.stroke !== undefined) style.stroke = vals.stroke;
  if (vals.strokeWidth !== undefined) style.strokeWidth = vals.strokeWidth;
  if (vals.opacity !== undefined) style.opacity = vals.opacity;
  if (vals.fillOpacity !== undefined) style.fillOpacity = vals.fillOpacity;
  if (vals.mixBlendMode !== undefined) style.mixBlendMode = vals.mixBlendMode;
  if (vals.strokeDasharray !== undefined)
    style.strokeDasharray = vals.strokeDasharray;
  if (vals.filter !== undefined) style.filter = vals.filter;
  return style;
};

/** A display item with its opacity (1 when unset) multiplied by `alpha`. How
 *  a paint-time animation fades an item it has already lowered
 *  (`time.transition()`, a build-in). */
export const fadeItem = (
  item: DisplayList.DisplayItem,
  alpha: number
): DisplayList.DisplayItem => ({
  ...item,
  style: { ...item.style, opacity: (item.style?.opacity ?? 1) * alpha },
});

/** Lower a boundary's children under its own translate, plus an optional
 *  extra `(dx, dy)` shift — the shared body of the simple translate-only
 *  boundaries (offset, enclose, arrow). Their subtree is flattened as the
 *  root bake and `layer` flatten it (`bakeChildren`), so a fresh child that
 *  only positions its children (a `treemap`, a `pack`, a `spread`) needs no
 *  lowering of its own, and each leaf lowers at its baked absolute
 *  transform. The leaves lower under the session's `toPixel`, so this also
 *  works inside a compositor (`mask`/`over`/`box`) that remapped it to a
 *  bbox-local frame. */
export const lowerChildrenOffset = (
  node: GoFishNode,
  transform: Transform | undefined,
  coordinateTransform: CoordinateTransform | undefined,
  dx = 0,
  dy = 0
): DisplayList.DisplayItem[] => {
  const [tx, ty] = displayTranslate(transform);
  return bakeChildren(node, [tx + dx, ty + dy]).flatMap((d) =>
    d.node.INTERNAL_lower(coordinateTransform, d.transform)
  );
};

/** Lower one subtree, `child` and what it holds, at `translate`: flattened
 *  by `bakeSubtree`, each entry lowered at its baked absolute transform
 *  under the session's `toPixel`. A compositor lowers each of its operands
 *  this way, so an operand that only places its children (a `pack`) needs
 *  no lowering of its own. */
export const lowerSubtree = (
  child: GoFishAST,
  translate: [number, number],
  coordinateTransform: CoordinateTransform | undefined
): DisplayList.DisplayItem[] =>
  bakeSubtree(child, translate).flatMap((d) =>
    d.node.INTERNAL_lower(coordinateTransform, d.transform)
  );
