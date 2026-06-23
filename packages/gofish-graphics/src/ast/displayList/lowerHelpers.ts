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
import { type Path, type Point, pathToSVGPath } from "../../path";

/** Map every point of a path through `toPixel`, then serialize to an SVG `d`.
 *  `toPixel` is affine (translate + y-flip), so no resampling is needed. */
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

/** Build a `RectItem` from a GoFish y-up box (min/max per axis). The y-up top
 *  edge (`gyMax`) maps to the smaller SVG y, so the top-left corner is
 *  `toPixel([gxMin, gyMax])`. */
export const rectItemFromBox = (
  gxMin: number,
  gxMax: number,
  gyMin: number,
  gyMax: number,
  toPixel: ToPixel,
  extra: Partial<DisplayList.RectItem> = {}
): DisplayList.RectItem => {
  const [x, y] = toPixel([gxMin, gyMax]);
  return {
    kind: "rect",
    x,
    y,
    w: gxMax - gxMin,
    h: gyMax - gyMin,
    ...extra,
  };
};

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

/** The inline value-label a `rect`/`ellipse` emits when `label` is set: white,
 *  12px, centered at the mark's transformed center. Empty when no label. */
export const valueLabelItems = (
  labelText: string | undefined,
  cx: number,
  cy: number,
  toPixel: ToPixel
): DisplayList.TextItem[] => {
  if (!labelText) return [];
  const [x, y] = toPixel([cx, cy]);
  return [
    {
      kind: "text",
      x,
      y,
      text: labelText,
      fontSize: 12,
      textAnchor: "middle",
      dominantBaseline: "central",
      role: "overlay",
      style: { fill: "white" },
    },
  ];
};

/** Run `run` with the render session's `toPixel` swapped to `next`, restoring it
 *  afterward — the boundary-lowering primitive (a boundary maps its subtree into
 *  a shifted/warped pixel frame for the duration of the child walk). */
export const withToPixel = <T>(
  node: GoFishNode,
  next: ToPixel,
  run: () => T
): T => {
  const session = node.getRenderSession();
  const outer = session.toPixel!;
  session.toPixel = next;
  try {
    return run();
  } finally {
    session.toPixel = outer;
  }
};

/** Lower a boundary's children under its own translate (the legacy
 *  `<g transform>`), plus an optional extra `(dx, dy)` shift — the shared body of
 *  the simple translate-only boundaries (offset, enclose, arrow). */
export const lowerChildrenOffset = (
  node: GoFishNode,
  transform: Transform | undefined,
  coordinateTransform: CoordinateTransform | undefined,
  dx = 0,
  dy = 0
): DisplayList.DisplayItem[] => {
  const [tx, ty] = displayTranslate(transform);
  const outer = node.getRenderSession().toPixel!;
  const composed: ToPixel = ([cx, cy]) => outer([tx + dx + cx, ty + dy + cy]);
  return withToPixel(node, composed, () =>
    (node.children as GoFishAST[]).flatMap((c) =>
      c.INTERNAL_lower(coordinateTransform)
    )
  );
};
